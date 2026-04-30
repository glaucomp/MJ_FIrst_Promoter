import { Response } from 'express';
import { PasswordResetPurpose, Prisma, PrismaClient, UserRole, UserType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolveAccountManagersFor } from '../services/ownership.service';
import { createPasswordResetToken } from '../services/password-reset.service';
import { emailService } from '../services/email.service';
import { buildSetPasswordUrl } from '../utils/frontend-url';

const prisma = new PrismaClient();

export const createAccountManager = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: UserRole.ADMIN,
        userType: UserType.ADMIN
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
        createdAt: true
      }
    });

    res.status(201).json({ user, message: 'Account manager created successfully' });
  } catch (error) {
    console.error('Create account manager error:', error);
    res.status(500).json({ error: 'Failed to create account manager' });
  }
};

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const caller = req.user;
    if (!caller) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const isAdmin = caller.role === UserRole.ADMIN;
    const isAccountManager = caller.userType === UserType.ACCOUNT_MANAGER;
    // Payers are read-only back-office users. They can read the user list so
    // Reports can resolve promoter names next to commissions, but they share
    // the admin's unscoped view (no AM filtering).
    const isPayer = caller.userType === UserType.PAYER;
    if (!isAdmin && !isAccountManager && !isPayer) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { role, search, accountManagerId, userType } = req.query;

    const where: any = {};

    // Validate enum query params against their Prisma enum before passing
    // them to the driver. Without this Prisma throws a P2009 at query time
    // and we'd surface a 500 for what is really a caller-side mistake.
    if (role !== undefined) {
      if (
        typeof role !== 'string' ||
        !Object.values(UserRole).includes(role as UserRole)
      ) {
        return res.status(400).json({
          error: `Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}`,
        });
      }
      where.role = role as UserRole;
    }

    if (userType !== undefined) {
      if (
        typeof userType !== 'string' ||
        !Object.values(UserType).includes(userType as UserType)
      ) {
        return res.status(400).json({
          error: `Invalid userType. Must be one of: ${Object.values(UserType).join(', ')}`,
        });
      }
      where.userType = userType as UserType;
    }

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Admin filter: list only users "owned" by a given account manager. The
    // three OR branches match the same graph the ownership resolver walks:
    //   1. explicit assignment via the new `accountManagerId` column,
    //   2. legacy fallback where `createdById` happens to be the AM (rows
    //      that predate the dedicated column, or admin-created chatters),
    //   3. promoter/TM relationships modelled via an ACTIVE referral.
    if (accountManagerId && typeof accountManagerId === 'string') {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { accountManagerId },
            { createdById: accountManagerId },
            {
              referralsReceived: {
                some: { referrerId: accountManagerId, status: 'ACTIVE' },
              },
            },
          ],
        },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
        isActive: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
          },
        },
        _count: {
          select: {
            createdCampaigns: true,
            referralsMade: true,
            referralsReceived: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Resolve the effective account manager for every returned user through
    // the shared ownership service. This keeps the endpoint aligned with the
    // rest of the system (promoters list, chatter groups, etc.) and gives us
    // a single in-memory map we can use both for scoping and for shaping the
    // `accountManager` field on each row.
    const amIdByUserId = await resolveAccountManagersFor(
      users.map((user) => user.id),
    );

    // Batch-load the full AM records (only the distinct ids we actually need)
    // in one query, so we can populate the embedded `accountManager` field
    // without another per-user round-trip.
    const distinctAmIds = [...new Set([...amIdByUserId.values()].filter((v): v is string => !!v))];
    const amRecords = distinctAmIds.length
      ? await prisma.user.findMany({
          where: { id: { in: distinctAmIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
          },
        })
      : [];
    const amRecordById = new Map(amRecords.map((am) => [am.id, am]));

    // Scope the list for account-manager callers *before* doing any per-user
    // stats work. They only see users whose effective AM resolves to
    // themselves, and they never see admins or other account managers in this
    // list. Admins see every row returned by the base query. This runs off
    // the already-resolved ownership map (no extra DB round-trips) and
    // prevents N+1 stats queries on rows that would be filtered out anyway.
    const visibleUsers = isAdmin || isPayer
      ? users
      : users.filter((user) => {
          if (user.userType === UserType.ADMIN) return false;
          if (user.userType === UserType.ACCOUNT_MANAGER) return false;
          return amIdByUserId.get(user.id) === caller.id;
        });

    // Batch stats lookups into two grouped queries instead of a findMany per
    // user. This collapses the old 2·N queries into 2 total, regardless of
    // how many users are visible.
    const visibleIds = visibleUsers.map((u) => u.id);

    const [referralGroups, commissionGroups] = visibleIds.length
      ? await Promise.all([
          prisma.referral.groupBy({
            by: ['referrerId', 'status'],
            where: { referrerId: { in: visibleIds } },
            _count: { _all: true },
          }),
          prisma.commission.groupBy({
            by: ['userId', 'status'],
            where: { userId: { in: visibleIds } },
            _sum: { amount: true },
          }),
        ])
      : [[], []];

    type ReferralStats = { total: number; active: number };
    const referralStatsByUser = new Map<string, ReferralStats>();
    for (const g of referralGroups) {
      const prev = referralStatsByUser.get(g.referrerId) ?? { total: 0, active: 0 };
      prev.total += g._count._all;
      if (g.status === 'ACTIVE') prev.active += g._count._all;
      referralStatsByUser.set(g.referrerId, prev);
    }

    type CommissionStats = { total: number; pending: number };
    const commissionStatsByUser = new Map<string, CommissionStats>();
    for (const g of commissionGroups) {
      const amount = g._sum.amount ?? 0;
      const prev = commissionStatsByUser.get(g.userId) ?? { total: 0, pending: 0 };
      prev.total += amount;
      if (g.status === 'unpaid' || g.status === 'pending') {
        prev.pending += amount;
      }
      commissionStatsByUser.set(g.userId, prev);
    }

    const scoped = visibleUsers.map((user) => {
      const referralStats = referralStatsByUser.get(user.id) ?? { total: 0, active: 0 };
      const commissionStats = commissionStatsByUser.get(user.id) ?? { total: 0, pending: 0 };

      const amId = amIdByUserId.get(user.id) ?? null;
      const accountManager = amId ? amRecordById.get(amId) ?? null : null;

      return {
        ...user,
        accountManager,
        stats: {
          totalReferrals: referralStats.total,
          activeReferrals: referralStats.active,
          totalEarnings: commissionStats.total,
          pendingEarnings: commissionStats.pending,
        },
      };
    });

    res.json({ users: scoped });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    // Users can only view their own profile unless they're admin
    if (currentUser.role !== UserRole.ADMIN && currentUser.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
        isActive: true,
        createdAt: true,
          _count: {
            select: {
              createdCampaigns: true,
              referralsMade: true,
              referralsReceived: true,
              commissions: true
            }
          }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

// Prisma client surface accepted by helpers that may be invoked either with
// the top-level client OR the interactive-transaction proxy. Using the
// transaction-client type means callers inside `prisma.$transaction` can
// pass `tx` directly so the work joins the surrounding transaction instead
// of starting its own implicit one.
type DbClient = PrismaClient | Prisma.TransactionClient;

// Cancel every ACTIVE referral the given user received whose campaign is a
// hidden AM membership campaign. Used both when an AM is reassigned away
// from a campaign and when an AM is demoted to a non-AM userType, so the
// stale membership row doesn't leak into "what hidden campaign is this user
// in?" lookups (e.g. the `currentCampaign` shaping in getAccountManagers).
async function cancelHiddenMembershipReferrals(
  userId: string,
  client: DbClient = prisma,
): Promise<void> {
  const stale = await client.referral.findMany({
    where: { referredUserId: userId, status: 'ACTIVE' },
    select: {
      id: true,
      campaign: { select: { isActive: true, visibleToPromoters: true } },
    },
  });
  const ids = stale
    .filter((r) => r.campaign.isActive && !r.campaign.visibleToPromoters)
    .map((r) => r.id);
  if (ids.length === 0) return;
  await client.referral.updateMany({
    where: { id: { in: ids } },
    data: { status: 'CANCELLED' },
  });
}

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;
    const { firstName, lastName, email, password, userType, campaignId } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      userType?: string;
      campaignId?: string | null;
    };

    // Users can only update their own profile unless they're admin
    if (currentUser.role !== UserRole.ADMIN && currentUser.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateData: any = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    // Only admins can change userType
    if (userType !== undefined && currentUser.role === UserRole.ADMIN) {
      updateData.userType = userType;
    }

    // We need the current row whenever an admin is touching userType or the
    // hidden-membership campaign so we can:
    //   1. Validate the campaign assignment against the userType the row will
    //      have AFTER the update (`nextUserType`), not the stale one — this
    //      lets a single request both promote a PROMOTER to AM and set their
    //      campaign without two round-trips.
    //   2. Detect AM → non-AM transitions on the way out and cancel any
    //      lingering ACTIVE hidden-membership referrals so they don't pollute
    //      AM lookups for the user's new identity.
    const adminTouchesMembership =
      currentUser.role === UserRole.ADMIN &&
      (campaignId !== undefined || userType !== undefined);
    const target = adminTouchesMembership
      ? await prisma.user.findUnique({
          where: { id },
          select: { id: true, userType: true },
        })
      : null;
    if (adminTouchesMembership && !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Effective userType post-update — what the row WILL be after Prisma
    // applies `updateData`. Only meaningful when we actually fetched `target`.
    const nextUserType: UserType | undefined = target
      ? ((updateData.userType as UserType | undefined) ?? target.userType)
      : undefined;

    // Account-manager campaign reassignment.
    //
    // AM ↔ campaign membership is encoded as an ACTIVE Referral row whose
    // `referredUser` is the AM and whose `campaign` is the hidden AM
    // membership campaign. To "change" an AM's campaign we cancel the existing
    // active hidden-campaign referral and create a fresh ACTIVE one pointing
    // at the new campaign. We keep `referrerId` stable when possible so
    // commission flow / provenance are preserved.
    //
    // Only admins can do this. We resolve the target campaign and validate it
    // up front so we don't half-update on a bad request.
    let resolvedAmCampaign:
      | { id: string; name: string; linkedCampaignId: string | null }
      | null = null;
    if (campaignId !== undefined && currentUser.role === UserRole.ADMIN) {
      // Use the effective post-update userType so a single request can
      // promote a user to AM and set their campaign at the same time.
      if (nextUserType !== UserType.ACCOUNT_MANAGER) {
        return res.status(400).json({
          error: 'Only account managers can be assigned to a hidden membership campaign',
        });
      }
      if (campaignId !== null) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: {
            id: true,
            name: true,
            isActive: true,
            visibleToPromoters: true,
            linkedCampaignId: true,
          },
        });
        if (!campaign || !campaign.isActive || campaign.visibleToPromoters) {
          return res.status(400).json({
            error: 'Selected campaign is not a valid hidden Account Manager campaign',
          });
        }
        resolvedAmCampaign = {
          id: campaign.id,
          name: campaign.name,
          linkedCampaignId: campaign.linkedCampaignId,
        };
      }
    }

    // The user update and any membership-referral mutations have to land
    // atomically — otherwise an admin could see profile fields change while
    // the AM↔campaign invariant is broken (e.g. user.update succeeds but
    // referral.create fails, leaving the AM with no hidden membership).
    // Validation has already happened above; everything inside this block is
    // a write and must roll back together on any failure.
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          userType: true,
          isActive: true,
          updatedAt: true,
        },
      });

      if (currentUser.role === UserRole.ADMIN && target) {
        const wasAm = target.userType === UserType.ACCOUNT_MANAGER;
        const isAm = updated.userType === UserType.ACCOUNT_MANAGER;

        if (wasAm && !isAm) {
          // Demoted away from AM — clear stale hidden-membership referrals so
          // the row doesn't keep showing up as an AM in membership lookups.
          // We do this regardless of whether `campaignId` was passed; the
          // userType change alone is enough to invalidate the membership.
          await cancelHiddenMembershipReferrals(id, tx);
        } else if (isAm && campaignId !== undefined) {
          // Find the AM's existing active hidden-campaign referral. We pull
          // every ACTIVE referral they received and filter in JS because
          // Prisma's relation filter doesn't compose well with `referredUserId`.
          const activeReferrals = await tx.referral.findMany({
            where: { referredUserId: id, status: 'ACTIVE' },
            select: {
              id: true,
              campaignId: true,
              referrerId: true,
              campaign: { select: { isActive: true, visibleToPromoters: true } },
            },
          });
          const existing = activeReferrals.find(
            (r) => r.campaign.isActive && !r.campaign.visibleToPromoters,
          );

          if (resolvedAmCampaign === null) {
            // Caller cleared the campaign — cancel the active hidden referral.
            if (existing) {
              await tx.referral.update({
                where: { id: existing.id },
                data: { status: 'CANCELLED' },
              });
            }
          } else if (!existing || existing.campaignId !== resolvedAmCampaign.id) {
            // Cancel any stale hidden membership referral, then create a fresh
            // ACTIVE one. Reuse the previous referrer when we have it so
            // commission attribution stays put; otherwise fall back to the
            // current admin caller.
            if (existing) {
              await tx.referral.update({
                where: { id: existing.id },
                data: { status: 'CANCELLED' },
              });
            }
            const referrerId = existing?.referrerId ?? currentUser.id;
            await tx.referral.create({
              data: {
                inviteCode: nanoid(10),
                campaignId: resolvedAmCampaign.id,
                referrerId,
                referredUserId: id,
                status: 'ACTIVE',
                level: 1,
                acceptedAt: new Date(),
              },
            });
          }
        }
      }

      return updated;
    });

    res.json({ user, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// PATCH /api/users/:id/account-manager
// Admin-only. Reassigns a user to a different account manager (or clears the
// assignment with `null`). Used by the drag-and-drop flow on the Admin Users
// page. The target must be an active ACCOUNT_MANAGER; we never let users be
// "owned" by another promoter/chatter/admin through this endpoint.
//
// This endpoint writes ONLY the dedicated `accountManagerId` column —
// `createdById` stays untouched so creation provenance is preserved across
// reassignments.
export const assignAccountManager = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Require `accountManagerId` to be explicitly present and to be either a
    // non-empty string (assign) or `null` (unassign). Treating a missing
    // field the same as `null` would let a PATCH with an empty body silently
    // clear the ownership link — which is almost certainly not what the
    // caller intended and would break Users-page invariants.
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(body, 'accountManagerId')) {
      return res.status(400).json({
        error: 'accountManagerId is required (pass null to unassign)',
      });
    }
    const accountManagerId = body.accountManagerId;
    if (
      accountManagerId !== null &&
      (typeof accountManagerId !== 'string' || accountManagerId.length === 0)
    ) {
      return res.status(400).json({
        error: 'accountManagerId must be a non-empty string or null',
      });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, userType: true },
    });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (
      target.userType === UserType.ADMIN ||
      target.userType === UserType.ACCOUNT_MANAGER ||
      target.userType === UserType.PAYER
    ) {
      return res.status(400).json({
        error:
          'Admins, account managers and payers cannot be assigned to an account manager',
      });
    }

    // Resolve the new AM's hidden-membership campaign so we can also migrate
    // the dragged user onto the AM's public `linkedCampaign`. Without this,
    // assigning would only flip `User.accountManagerId` and leave the user's
    // active Referral pointing at the *previous* AM's campaign — meaning the
    // new AM would own the user on the Users page but the user would still
    // appear under the old AM's "My Promoters" list and continue to accrue
    // commissions on the old campaign tier.
    //
    // We only migrate when assigning. Unassignment (accountManagerId=null)
    // intentionally leaves Referrals alone so we don't orphan a user's
    // commission attribution as a side-effect of clearing the column.
    let targetLinkedCampaignId: string | null = null;
    if (accountManagerId) {
      const manager = await prisma.user.findUnique({
        where: { id: accountManagerId },
        select: { id: true, userType: true, isActive: true },
      });
      if (!manager || manager.userType !== UserType.ACCOUNT_MANAGER || !manager.isActive) {
        return res.status(400).json({ error: 'Target is not an active account manager' });
      }
      if (manager.id === id) {
        return res.status(400).json({ error: 'A user cannot be assigned to themselves' });
      }

      // The AM's hidden membership campaign — created by an admin invite —
      // carries `linkedCampaignId` pointing at the public campaign that AM
      // recruits promoters under (same plumbing `createReferralInvite` uses
      // when an AM sends a regular invite). We pick the most recently
      // accepted ACTIVE membership in case an AM has been moved across
      // campaigns over time.
      const amMembership = await prisma.referral.findFirst({
        where: {
          referredUserId: accountManagerId,
          status: 'ACTIVE',
          campaign: {
            isActive: true,
            visibleToPromoters: false,
            linkedCampaignId: { not: null },
          },
        },
        orderBy: { acceptedAt: 'desc' },
        select: { campaign: { select: { linkedCampaignId: true } } },
      });
      targetLinkedCampaignId = amMembership?.campaign?.linkedCampaignId ?? null;
      if (!targetLinkedCampaignId) {
        // The AM has no usable hidden-membership campaign yet — most likely
        // an admin promoted them to AM but never bound them to a campaign.
        // We log a warning and continue with the bare `accountManagerId`
        // update so the assignment isn't blocked entirely; the user will
        // still need to be moved onto a campaign once the AM is configured.
        console.warn('[assignAccountManager] AM has no linked public campaign; skipping referral migration', {
          accountManagerId,
          userId: id,
        });
      }
    }

    // Wrap the User update + Referral migration so we never leave the rows
    // in an inconsistent state (e.g. accountManagerId pointing at AM2 while
    // the active Referral still claims AM1).
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { accountManagerId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          userType: true,
          accountManager: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              userType: true,
            },
          },
        },
      });

      if (accountManagerId && targetLinkedCampaignId) {
        // Find the user's current "I am the invitee" referral. We treat the
        // most recent ACTIVE one as authoritative and only migrate when it
        // doesn't already point at the new AM's linkedCampaign — repeated
        // drags onto the same AM are a no-op.
        const current = await tx.referral.findFirst({
          where: { referredUserId: id, status: 'ACTIVE' },
          orderBy: { acceptedAt: 'desc' },
          select: { id: true, campaignId: true, referrerId: true },
        });

        const alreadyOnTargetCampaign =
          current &&
          current.campaignId === targetLinkedCampaignId &&
          current.referrerId === accountManagerId;

        if (!alreadyOnTargetCampaign) {
          // Cancel any stale active referrals so the user has at most one
          // ACTIVE "I am the invitee" row at a time. We deliberately do NOT
          // touch CANCELLED / PENDING referrals or the user's customer-
          // tracking referrals (those have referredUserId=null), and we
          // do NOT re-attribute past commissions — historical commission
          // ownership stays with the old referral.
          //
          // Each row is updated individually so we can merge the
          // `source: 'am-migration'` marker into its existing metadata without
          // overwriting it. The marker lets the frontend distinguish these from
          // explicit AM rejections (which also use CANCELLED) and suppress the
          // misleading "Denied" chip for migrated rows.
          const activeReferrals = await tx.referral.findMany({
            where: { referredUserId: id, status: 'ACTIVE' },
            select: { id: true, metadata: true },
          });
          for (const ref of activeReferrals) {
            const existing =
              typeof ref.metadata === 'object' && ref.metadata !== null
                ? (ref.metadata as Record<string, unknown>)
                : {};
            await tx.referral.update({
              where: { id: ref.id },
              data: {
                status: 'CANCELLED',
                metadata: {
                  ...existing,
                  source: 'am-migration',
                  migratedAt: new Date().toISOString(),
                } as Prisma.InputJsonValue,
              },
            });
          }

          await tx.referral.create({
            data: {
              referrerId: accountManagerId,
              referredUserId: id,
              campaignId: targetLinkedCampaignId,
              // 10-char nanoid; collisions are astronomically unlikely
              // and a P2002 here would just bubble out of the txn,
              // rolling the user.update back too — exactly what we want.
              inviteCode: nanoid(10),
              status: 'ACTIVE',
              acceptedAt: new Date(),
              metadata: {
                source: 'manual-am-assign',
                previousReferralId: current?.id ?? null,
                assignedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
        }
      }

      return u;
    });

    // Mirror the shape used by getAllUsers so the frontend can replace a row
    // with the response directly if it wants to. The `accountManager` object
    // comes straight from the dedicated relation now — no more inferring it
    // from `createdBy` since those concepts are properly separated.
    const accountManager =
      updated.accountManager?.userType === UserType.ACCOUNT_MANAGER
        ? updated.accountManager
        : null;

    res.json({ user: { ...updated, accountManager } });
  } catch (error) {
    console.error('Assign account manager error:', error);
    res.status(500).json({ error: 'Failed to assign account manager' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Soft pre-flight checks for the relations that have RESTRICT delete
    // semantics in the schema (Campaign.createdById and ChatterGroup.createdById).
    // For AMs especially, this is the typical reason a delete fails — surface a
    // clear 409 before we hit the FK-constraint error.
    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        userType: true,
        _count: {
          select: {
            createdCampaigns: true,
            createdChatterGroups: true,
            managedUsers: true,
          },
        },
      },
    });

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const blockingCounts = target._count;
    if (
      (blockingCounts.createdCampaigns ?? 0) > 0 ||
      (blockingCounts.createdChatterGroups ?? 0) > 0
    ) {
      const reasons: string[] = [];
      if (blockingCounts.createdCampaigns) {
        reasons.push(
          `${blockingCounts.createdCampaigns} campaign${blockingCounts.createdCampaigns === 1 ? '' : 's'}`,
        );
      }
      if (blockingCounts.createdChatterGroups) {
        reasons.push(
          `${blockingCounts.createdChatterGroups} chatter group${blockingCounts.createdChatterGroups === 1 ? '' : 's'}`,
        );
      }
      return res.status(409).json({
        error: `Cannot delete this user — they still own ${reasons.join(' and ')}. Reassign or delete those first.`,
      });
    }

    await prisma.user.delete({ where: { id } });

    res.json({
      message: 'User deleted successfully',
      // Useful for the admin UI: how many people now need re-assignment.
      managedUsersOrphaned: blockingCounts.managedUsers ?? 0,
    });
  } catch (error: any) {
    // Prisma FK constraint errors land here (e.g. relations we didn't pre-check).
    if (error?.code === 'P2003') {
      console.error('Delete user FK error:', error);
      return res.status(409).json({
        error: 'Cannot delete this user — they are still referenced by other records.',
      });
    }
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

export const createUserByAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const caller = req.user;
    if (!caller) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const callerIsAdmin = caller.role === UserRole.ADMIN;
    const callerIsAm = caller.userType === UserType.ACCOUNT_MANAGER;
    if (!callerIsAdmin && !callerIsAm) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Surface express-validator failures (e.g. malformed email) before any
    // DB work. The route-level validator also lower-cases the address via
    // normalizeEmail() so the row gets stored in the same canonical form
    // /login looks up.
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, firstName, lastName, userType, campaignId } = req.body as {
      email?: string;
      firstName?: string;
      lastName?: string;
      userType?: string;
      campaignId?: string;
    };

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Admins can create AMs, TMs, promoters and payers. AMs can only create
    // promoters (chatters go through POST /api/chatters). Payers are an
    // admin-only role that sees Reports / Payouts / Settings and nothing else.
    const allowedTypes: UserType[] = callerIsAdmin
      ? [
          UserType.ACCOUNT_MANAGER,
          UserType.TEAM_MANAGER,
          UserType.PROMOTER,
          UserType.PAYER,
        ]
      : [UserType.PROMOTER];
    const requestedType = userType as UserType | undefined;
    if (requestedType && !allowedTypes.includes(requestedType)) {
      return res.status(403).json({
        error: `You are not allowed to create a ${requestedType.toLowerCase().replace('_', ' ')}`,
      });
    }
    const resolvedType: UserType = requestedType ?? UserType.PROMOTER;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'A user with that email already exists' });
    }

    // Generate an unguessable placeholder hash. The user never sees it — they
    // set their real password through the invite-email flow below. We still
    // need *a* hash because `users.password` is NOT NULL in the schema, and
    // we don't want to weaken that constraint for historical rows.
    const placeholderSecret = crypto.randomBytes(32).toString('base64url');
    const hashedPassword = await bcrypt.hash(placeholderSecret, 10);

    // Derive a unique username from the email prefix
    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let username = baseUsername;
    let counter = 1;
    while (await prisma.user.findUnique({ where: { username } })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    // Stamp provenance + ownership separately now that the two concerns are
    // distinct columns:
    //   • `createdById`      — always the caller. Immutable once written.
    //   • `accountManagerId` — the caller only when they're an active AM.
    //                          Admin-created users start unassigned and the
    //                          admin can drop them onto an AM via the
    //                          PATCH /api/users/:id/account-manager flow.
    const accountManagerId = callerIsAm ? caller.id : null;

    // For account managers created by admin: validate and look up the hidden
    // membership campaign BEFORE creating the user so that an invalid
    // `campaignId` returns 400 without leaving a "ghost" user row.
    // The admin can pick the hidden membership campaign explicitly via
    // `campaignId` on the request body; that's the new path and how the
    // FE wires the "Account Manager → Campaign" picker on the create
    // user modal. If they don't, we fall back to the historical
    // auto-pick (first hidden campaign with a `linkedCampaignId`, then
    // any hidden campaign) so older API callers keep working.
    let adminCampaign = null as Awaited<ReturnType<typeof prisma.campaign.findFirst>>;
    if (callerIsAdmin && resolvedType === UserType.ACCOUNT_MANAGER) {
      if (campaignId) {
        adminCampaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
        });
        if (!adminCampaign || !adminCampaign.isActive || adminCampaign.visibleToPromoters) {
          return res.status(400).json({
            error:
              'Selected campaign is not a valid hidden Account Manager campaign',
          });
        }
      }
      adminCampaign ??= await prisma.campaign.findFirst({
        where: {
          isActive: true,
          visibleToPromoters: false,
          linkedCampaignId: { not: null },
        },
        orderBy: { id: 'asc' },
      });
      adminCampaign ??= await prisma.campaign.findFirst({
        where: { isActive: true, visibleToPromoters: false },
        orderBy: { id: 'asc' },
      });
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        role: UserRole.PROMOTER,
        userType: resolvedType,
        inviteCode: username,
        isActive: true,
        createdById: caller.id,
        accountManagerId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
        isActive: true,
        createdAt: true,
      },
    });

    // For account managers created by admin: automatically link them to the
    // admin via a referral so commissions can flow. AMs are auto-approved to
    // invite on every active campaign — the invite gate in
    // referral.controller.ts gates hidden campaigns on userType only, so we
    // don't need per-campaign referrals here.
    if (callerIsAdmin && resolvedType === UserType.ACCOUNT_MANAGER) {
      if (adminCampaign && !adminCampaign.linkedCampaignId) {
        const publicCampaigns = await prisma.campaign.findMany({
          where: { isActive: true, visibleToPromoters: true },
          select: { id: true },
          take: 2,
        });
        if (publicCampaigns.length === 1) {
          const updateResult = await prisma.campaign.updateMany({
            where: {
              id: adminCampaign.id,
              isActive: true,
              visibleToPromoters: false,
              linkedCampaignId: null,
            },
            data: { linkedCampaignId: publicCampaigns[0].id },
          });
          if (updateResult.count === 1) {
            adminCampaign = {
              ...adminCampaign,
              linkedCampaignId: publicCampaigns[0].id,
            };
          }
        }
      }
      if (adminCampaign) {
        await prisma.referral.create({
          data: {
            inviteCode: nanoid(10),
            campaignId: adminCampaign.id,
            referrerId: caller.id,
            referredUserId: newUser.id,
            status: 'ACTIVE',
            level: 1,
            acceptedAt: new Date(),
          },
        });
      }
    }

    // Send the password-setup invite. We intentionally don't fail the
    // whole request if the email send fails — the user row is already
    // created, and the caller can re-issue an invite from the UI. We do
    // surface the outcome in the response so the modal can tell the admin.
    let inviteEmailSent = false;
    try {
      const { rawToken, expiresAt } = await createPasswordResetToken(
        newUser.id,
        PasswordResetPurpose.INVITE,
      );
      const setupUrl = buildSetPasswordUrl(rawToken);
      const callerRecord = await prisma.user.findUnique({
        where: { id: caller.id },
        select: { firstName: true, lastName: true, email: true },
      });
      const invitedByName = [callerRecord?.firstName, callerRecord?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || callerRecord?.email || caller.email;
      inviteEmailSent = await emailService.sendSetPasswordEmail({
        email: newUser.email,
        firstName: newUser.firstName,
        setupUrl,
        invitedByName,
        expiresAt,
      });
    } catch (err) {
      console.error('Failed to send invite email:', err);
    }

    res.status(201).json({
      user: { ...newUser, stats: { totalReferrals: 0, activeReferrals: 0, totalEarnings: 0, pendingEarnings: 0 } },
      inviteEmailSent,
      message: inviteEmailSent
        ? 'User created and invite email sent'
        : 'User created — invite email could not be sent',
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const getAccountManagers = async (_req: AuthRequest, res: Response) => {
  try {
    // Strictly ACCOUNT_MANAGER. Admins were previously included here but the
    // admin Users page uses this list to build AM section headers, and admins
    // don't own users in that model — they'd show up with 0 users forever.
    const managers = await prisma.user.findMany({
      where: {
        userType: UserType.ACCOUNT_MANAGER,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        _count: {
          select: {
            createdCampaigns: true,
            createdChatterGroups: true,
          },
        },
        // Include the active referral whose campaign is the hidden AM
        // membership campaign — that's how AM↔campaign membership is encoded.
        // We pull every ACTIVE referral the AM received and pick the hidden,
        // active one in code. There should normally be exactly one.
        referralsReceived: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            campaign: {
              select: {
                id: true,
                name: true,
                isActive: true,
                visibleToPromoters: true,
                linkedCampaign: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });

    const shaped = managers.map((m) => {
      const membership = m.referralsReceived.find(
        (r) => r.campaign.isActive && !r.campaign.visibleToPromoters,
      );
      const { referralsReceived: _drop, ...rest } = m;
      return {
        ...rest,
        currentCampaign: membership
          ? {
              id: membership.campaign.id,
              name: membership.campaign.name,
              linkedCampaign: membership.campaign.linkedCampaign,
            }
          : null,
      };
    });

    res.json({ managers: shaped });
  } catch (error) {
    console.error('Get account managers error:', error);
    res.status(500).json({ error: 'Failed to fetch account managers' });
  }
};

// GET /api/users/promoters — list promoters and team managers (accessible to account managers)
export const getPromoters = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const isAdminOrAM =
      req.user.role === UserRole.ADMIN ||
      req.user.userType === UserType.ACCOUNT_MANAGER;

    if (!isAdminOrAM) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const users = await prisma.user.findMany({
      where: {
        userType: { in: [UserType.PROMOTER, UserType.TEAM_MANAGER] },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userType: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Scope to the caller's team when they're an account manager. Admins see
    // every promoter/TM. Uses the shared effective-AM resolver so visibility
    // here matches the Users page, chatter groups, etc.
    const isAdmin = req.user.role === UserRole.ADMIN;
    let visibleUsers = users;
    if (!isAdmin) {
      const callerId = req.user.id;
      const amByUser = await resolveAccountManagersFor(users.map((u) => u.id));
      visibleUsers = users.filter((u) => amByUser.get(u.id) === callerId);
    }

    res.json({ users: visibleUsers });
  } catch (error) {
    console.error('Get promoters error:', error);
    res.status(500).json({ error: 'Failed to fetch promoters' });
  }
};
