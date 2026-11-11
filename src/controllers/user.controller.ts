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
import {
  enrollAmPromotersOnPublicCampaigns,
  syncAmHiddenMemberships,
  syncPromoterToAmLinkedCampaigns,
  unenrollAmPromotersFromPublicCampaigns,
} from '../services/referral-membership.service';

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
    const {
      firstName,
      lastName,
      email,
      password,
      userType,
      campaignId,
      campaignIds,
    } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      userType?: string;
      /** Legacy single-campaign replace. Ignored when `campaignIds` is sent. */
      campaignId?: string | null;
      /** Sync the AM onto exactly these hidden membership campaigns. */
      campaignIds?: string[];
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

    const hasCampaignIds = Array.isArray(campaignIds);
    const touchesCampaignAssignment =
      hasCampaignIds || campaignId !== undefined;

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
      (touchesCampaignAssignment || userType !== undefined);
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

    // Resolve the desired hidden-campaign set up front so bad ids 400 before
    // we write. Prefer `campaignIds` (multi) over legacy `campaignId` (replace).
    let desiredHiddenCampaignIds: string[] | null = null;
    if (touchesCampaignAssignment && currentUser.role === UserRole.ADMIN) {
      if (nextUserType !== UserType.ACCOUNT_MANAGER) {
        return res.status(400).json({
          error: 'Only account managers can be assigned to a hidden membership campaign',
        });
      }
      if (hasCampaignIds) {
        desiredHiddenCampaignIds = campaignIds!;
      } else if (campaignId === null) {
        desiredHiddenCampaignIds = [];
      } else if (typeof campaignId === 'string') {
        desiredHiddenCampaignIds = [campaignId];
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
        } else if (isAm && desiredHiddenCampaignIds !== null) {
          const sync = await syncAmHiddenMemberships(tx, {
            amUserId: id,
            desiredCampaignIds: desiredHiddenCampaignIds,
            referrerId: currentUser.id,
          });
          await enrollAmPromotersOnPublicCampaigns(tx, {
            amUserId: id,
            publicCampaignIds: sync.addedLinkedPublicIds,
          });
          await unenrollAmPromotersFromPublicCampaigns(tx, {
            amUserId: id,
            publicCampaignIds: sync.removedLinkedPublicIds,
          });
        }
      }

      return updated;
    });

    res.json({ user, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('not a valid hidden Account Manager campaign') ||
      message.includes('were not found')
    ) {
      return res.status(400).json({ error: message });
    }
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

    // Resolve every public campaign linked from the AM's hidden memberships
    // so the dragged user lands on all of them. Without this, assigning would
    // only flip `User.accountManagerId` and leave referrals on the previous
    // AM's campaigns.
    //
    // We only migrate when assigning. Unassignment (accountManagerId=null)
    // intentionally leaves Referrals alone so we don't orphan a user's
    // commission attribution as a side-effect of clearing the column.
    let targetLinkedCampaignIds: string[] = [];
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

      const amMemberships = await prisma.referral.findMany({
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
      targetLinkedCampaignIds = Array.from(
        new Set(
          amMemberships
            .map((m) => m.campaign.linkedCampaignId)
            .filter((cid): cid is string => Boolean(cid)),
        ),
      );
      if (targetLinkedCampaignIds.length === 0) {
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

      if (accountManagerId && targetLinkedCampaignIds.length > 0) {
        // Prefer adopting orphan invites on each target campaign before
        // creating fresh rows, so "AM invited email → admin created user →
        // dragged onto AM" does not leave a stranded PENDING card.
        for (const targetLinkedCampaignId of targetLinkedCampaignIds) {
          const orphanInvite = u.email
            ? await tx.referral.findFirst({
                where: {
                  referrerId: accountManagerId,
                  campaignId: targetLinkedCampaignId,
                  referredUserId: null,
                  status: { in: ['PENDING', 'ACTIVE'] },
                  metadata: { path: ['inviteeEmail'], equals: u.email },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, metadata: true },
              })
            : null;

          if (orphanInvite) {
            const orphanMeta =
              typeof orphanInvite.metadata === 'object' &&
              orphanInvite.metadata !== null
                ? (orphanInvite.metadata as Record<string, unknown>)
                : {};
            await tx.referral.update({
              where: { id: orphanInvite.id },
              data: {
                referredUserId: id,
                status: 'ACTIVE',
                acceptedAt: new Date(),
                metadata: {
                  ...orphanMeta,
                  source: 'am-assign-adopted',
                  adoptedAt: new Date().toISOString(),
                } as Prisma.InputJsonValue,
              },
            });
          }
        }

        // Cancel orphan invites this AM still has open for the same email on
        // campaigns outside the AM's current linked set.
        if (u.email) {
          const otherOrphans = await tx.referral.findMany({
            where: {
              referrerId: accountManagerId,
              campaignId: { notIn: targetLinkedCampaignIds },
              referredUserId: null,
              status: { in: ['PENDING', 'ACTIVE'] },
              metadata: { path: ['inviteeEmail'], equals: u.email },
            },
            select: { id: true, metadata: true },
          });
          for (const ref of otherOrphans) {
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
        }

        await syncPromoterToAmLinkedCampaigns(tx, {
          promoterUserId: id,
          amUserId: accountManagerId,
          linkedPublicCampaignIds: targetLinkedCampaignIds,
        });
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
            referralsMade: true,
            referralsReceived: true,
            chatterGroupMemberships: true,
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

    // Several FKs on User don't cascade in the schema and would otherwise
    // trip a P2003 before we ever reach the delete row. Admin-delete is the
    // "I want this user gone" escape hatch, so we clean them up explicitly
    // inside a transaction rather than asking the operator to hunt them down
    // from a dozen UIs first:
    //   • Referral.referrerId  (RESTRICT, not nullable)   → hard-delete the rows
    //   • Referral.referredUserId (RESTRICT, nullable)    → null it out (keeps
    //     history + commission attribution for the inviter)
    //   • Commission.referralId (nullable, no onDelete)   → null it out on any
    //     commission pointing at a referral we're about to delete; commissions
    //     owned by *this* user cascade via Commission.userId=Cascade, so this
    //     only affects commissions belonging to other users (e.g. upstream
    //     referrers on child referrals).
    //   • Referral.parentReferralId (nullable, no onDelete) → null it out on
    //     any child referrals whose parent we're deleting.
    //   • ClickTracking.userId  (nullable, no onDelete)   → null it out so the
    //     historic click record survives for reporting.
    //
    // ChatterGroupMember.chatterId cascades already, as do apiKeys / tracking
    // links / social links / password tokens / commissions owned by this user,
    // so those need no explicit cleanup.
    await prisma.$transaction(async (tx) => {
      // Collect the ids of referrals we're about to hard-delete so we can
      // clean up every FK pointing at them in one pass (rather than per-row
      // in a loop).
      const referrerRefs = await tx.referral.findMany({
        where: { referrerId: id },
        select: { id: true },
      });
      const referrerRefIds = referrerRefs.map((r) => r.id);

      if (referrerRefIds.length > 0) {
        // Detach commissions + child referrals + click tracking + customers +
        // transactions so the referral.deleteMany below doesn't hit a Restrict.
        await tx.commission.updateMany({
          where: { referralId: { in: referrerRefIds } },
          data: { referralId: null },
        });
        await tx.referral.updateMany({
          where: { parentReferralId: { in: referrerRefIds } },
          data: { parentReferralId: null },
        });
        await tx.clickTracking.updateMany({
          where: { referralId: { in: referrerRefIds } },
          data: { referralId: null },
        });
        await tx.customer.updateMany({
          where: { referralId: { in: referrerRefIds } },
          data: { referralId: null },
        });
        await tx.transaction.updateMany({
          where: { referralId: { in: referrerRefIds } },
          data: { referralId: null },
        });
        // PreUser.referralId cascades on delete, so it goes away automatically.
        await tx.referral.deleteMany({
          where: { id: { in: referrerRefIds } },
        });
      }

      // Orphan referrals where this user is the invitee — we keep the row so
      // the inviter's My Promoters history / commission attribution survives.
      await tx.referral.updateMany({
        where: { referredUserId: id },
        data: { referredUserId: null },
      });

      // ClickTracking.userId is nullable + has no cascade, so null it out
      // rather than let the FK block the user.delete below.
      await tx.clickTracking.updateMany({
        where: { userId: id },
        data: { userId: null },
      });

      await tx.user.delete({ where: { id } });
    });

    res.json({
      message: 'User deleted successfully',
      // Useful for the admin UI: how many people now need re-assignment.
      managedUsersOrphaned: blockingCounts.managedUsers ?? 0,
      referralsRemoved: blockingCounts.referralsMade ?? 0,
      referralsOrphaned: blockingCounts.referralsReceived ?? 0,
      chatterGroupsLeft: blockingCounts.chatterGroupMemberships ?? 0,
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

    // Surface express-validator failures (e.g. malformed email) before any
    // DB work. The route-level validator also lower-cases the address via
    // normalizeEmail() so the row gets stored in the same canonical form
    // /login looks up.
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, firstName, lastName, userType, campaignId, campaignIds } =
      req.body as {
        email?: string;
        firstName?: string;
        lastName?: string;
        userType?: string;
        campaignId?: string;
        campaignIds?: string[];
      };

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Admins can create AMs, TMs, promoters and payers. Account managers
    // invite chatters only through POST /api/chatters (not this endpoint).
    // Payers are an admin-only role that sees Reports / Payouts / Settings
    // and nothing else.
    const allowedTypes: UserType[] = [
      UserType.ACCOUNT_MANAGER,
      UserType.TEAM_MANAGER,
      UserType.PROMOTER,
      UserType.PAYER,
    ];
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
    //   • `createdById`      — always the caller (admin). Immutable once written.
    //   • `accountManagerId` — null here; assign via PATCH /api/users/:id/account-manager.
    const accountManagerId = null;

    // For account managers created by admin: resolve the desired hidden
    // membership campaign set BEFORE creating the user so that an invalid
    // id returns 400 without leaving a "ghost" user row.
    // Prefer `campaignIds` (multi-select). Fall back to legacy `campaignId`,
    // then to the historical auto-pick so older API callers keep working.
    let desiredHiddenCampaignIds: string[] = [];
    if (resolvedType === UserType.ACCOUNT_MANAGER) {
      if (Array.isArray(campaignIds) && campaignIds.length > 0) {
        desiredHiddenCampaignIds = Array.from(new Set(campaignIds.filter(Boolean)));
      } else if (campaignId) {
        desiredHiddenCampaignIds = [campaignId];
      }

      if (desiredHiddenCampaignIds.length > 0) {
        const campaigns = await prisma.campaign.findMany({
          where: { id: { in: desiredHiddenCampaignIds } },
          select: {
            id: true,
            isActive: true,
            visibleToPromoters: true,
            linkedCampaignId: true,
          },
        });
        if (campaigns.length !== desiredHiddenCampaignIds.length) {
          return res.status(400).json({
            error: 'One or more selected campaigns were not found',
          });
        }
        for (const c of campaigns) {
          if (!c.isActive || c.visibleToPromoters) {
            return res.status(400).json({
              error:
                'Selected campaign is not a valid hidden Account Manager campaign',
            });
          }
        }

        // Self-heal unlinked membership campaigns when there is exactly one
        // obvious public campaign (same behavior as the old single-create path).
        const unlinked = campaigns.filter((c) => !c.linkedCampaignId);
        if (unlinked.length > 0) {
          const publicCampaigns = await prisma.campaign.findMany({
            where: { isActive: true, visibleToPromoters: true },
            select: { id: true },
            take: 2,
          });
          if (publicCampaigns.length === 1) {
            await prisma.campaign.updateMany({
              where: {
                id: { in: unlinked.map((c) => c.id) },
                isActive: true,
                visibleToPromoters: false,
                linkedCampaignId: null,
              },
              data: { linkedCampaignId: publicCampaigns[0].id },
            });
          }
        }
      } else {
        const fallback =
          (await prisma.campaign.findFirst({
            where: {
              isActive: true,
              visibleToPromoters: false,
              linkedCampaignId: { not: null },
            },
            orderBy: { id: 'asc' },
            select: { id: true },
          })) ??
          (await prisma.campaign.findFirst({
            where: { isActive: true, visibleToPromoters: false },
            orderBy: { id: 'asc' },
            select: { id: true },
          }));
        if (fallback) desiredHiddenCampaignIds = [fallback.id];
      }
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

    // For account managers created by admin: create one ACTIVE hidden
    // membership referral per selected campaign.
    if (
      resolvedType === UserType.ACCOUNT_MANAGER &&
      desiredHiddenCampaignIds.length > 0
    ) {
      await syncAmHiddenMemberships(prisma, {
        amUserId: newUser.id,
        desiredCampaignIds: desiredHiddenCampaignIds,
        referrerId: caller.id,
      });
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
      const memberships = m.referralsReceived
        .filter((r) => r.campaign.isActive && !r.campaign.visibleToPromoters)
        .map((r) => ({
          id: r.campaign.id,
          name: r.campaign.name,
          linkedCampaign: r.campaign.linkedCampaign,
        }));
      const { referralsReceived: _drop, ...rest } = m;
      return {
        ...rest,
        /** Every hidden membership campaign this AM is enrolled in. */
        campaigns: memberships,
        /**
         * First membership — kept for older UI that still reads a single
         * `currentCampaign`. Prefer `campaigns` for multi-company AMs.
         */
        currentCampaign: memberships[0] ?? null,
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
