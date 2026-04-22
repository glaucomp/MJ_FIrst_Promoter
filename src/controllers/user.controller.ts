import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolveAccountManagersFor } from '../services/ownership.service';

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
    if (!isAdmin && !isAccountManager) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { role, search, accountManagerId, userType } = req.query;

    const where: any = {};

    if (role) {
      where.role = role as UserRole;
    }

    if (userType) {
      where.userType = userType as UserType;
    }

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Admin filter: list only users "owned" by a given account manager.
    // For chatters we trust `createdById`. For promoters / team managers the
    // AM relationship is modelled via an ACTIVE referral where the AM is the
    // referrer — so we fall back to that when `createdById` isn't set.
    if (accountManagerId && typeof accountManagerId === 'string') {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
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

    // Resolve the effective account manager through the shared ownership
    // service so this endpoint stays aligned with the rest of the system.
    const resolvedAccountManagers = await resolveAccountManagersFor(
      users.map((user) => user.id)
    );
    const effectiveAccountManagerByUserId = new Map(
      resolvedAccountManagers.map((resolution) => [
        resolution.userId,
        resolution.accountManager
          ? {
              id: resolution.accountManager.id,
              email: resolution.accountManager.email,
              firstName: resolution.accountManager.firstName,
              lastName: resolution.accountManager.lastName,
              userType: resolution.accountManager.userType,
            }
          : null,
      ])
    );
    type BasicUser = (typeof allBasicUsers)[number];
    const isActiveAm = (u: BasicUser | undefined | null) =>
      !!u && u.userType === UserType.ACCOUNT_MANAGER && u.isActive !== false;

    // Walk up the chain (createdBy first, then active incoming referrers) to
    // find the first active AM. Memoized + cycle-guarded.
    const resolveCache = new Map<string, BasicUser | null>();
    const resolveAm = (userId: string, seen: Set<string> = new Set()): BasicUser | null => {
      if (resolveCache.has(userId)) return resolveCache.get(userId)!;
      if (seen.has(userId)) return null;
      seen.add(userId);

      const u = userById.get(userId);
      if (!u) {
        resolveCache.set(userId, null);
        return null;
      }

      // 1. Explicit createdBy
      const createdBy = u.createdById ? userById.get(u.createdById) : null;
      if (isActiveAm(createdBy)) {
        resolveCache.set(userId, createdBy!);
        return createdBy!;
      }

      // 2. Active incoming referrers (direct or transitive)
      const referrerIds = incomingByUser.get(userId) ?? [];
      for (const refId of referrerIds) {
        const ref = userById.get(refId);
        if (isActiveAm(ref)) {
          resolveCache.set(userId, ref!);
          return ref!;
        }
      }
      for (const refId of referrerIds) {
        const upstream = resolveAm(refId, seen);
        if (upstream) {
          resolveCache.set(userId, upstream);
          return upstream;
        }
      }

      // 3. Upstream via createdBy chain (rare, but keeps things consistent)
      if (createdBy) {
        const upstream = resolveAm(createdBy.id, seen);
        if (upstream) {
          resolveCache.set(userId, upstream);
          return upstream;
        }
      }

      resolveCache.set(userId, null);
      return null;
    };

    // Scope the list for account-manager callers *before* doing any per-user
    // stats work. They only see users whose effective AM resolves to
    // themselves, and they never see admins or other account managers in this
    // list. Admins see every row returned by the base query. This runs off
    // the in-memory ownership graph (no extra DB round-trips) and prevents
    // N+1 stats queries on rows that would be filtered out afterwards.
    const visibleUsers = isAdmin
      ? users
      : users.filter((user) => {
          if (user.userType === UserType.ADMIN) return false;
          if (user.userType === UserType.ACCOUNT_MANAGER) return false;
          return resolveAm(user.id)?.id === caller.id;
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

      const resolved = resolveAm(user.id);
      const accountManager = resolved
        ? {
            id: resolved.id,
            email: resolved.email,
            firstName: resolved.firstName,
            lastName: resolved.lastName,
            userType: resolved.userType,
          }
        : null;

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

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;
    const { firstName, lastName, email, password, userType } = req.body;

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

    const user = await prisma.user.update({
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
        updatedAt: true
      }
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
export const assignAccountManager = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { accountManagerId } = req.body as { accountManagerId: string | null };

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, userType: true },
    });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.userType === UserType.ADMIN) {
      return res.status(400).json({ error: 'Admins cannot be assigned to an account manager' });
    }

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
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { createdById: accountManagerId ?? null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
        createdBy: {
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

    // Mirror the shape used by getAllUsers so the frontend can replace a row
    // with the response directly if it wants to.
    const accountManager =
      updated.createdBy?.userType === UserType.ACCOUNT_MANAGER
        ? updated.createdBy
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

    await prisma.user.delete({
      where: { id }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
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

    const { email, password, firstName, lastName, userType } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Admins can create AMs, TMs and promoters. AMs can only create promoters
    // (chatters go through POST /api/chatters).
    const allowedTypes: UserType[] = callerIsAdmin
      ? [UserType.ACCOUNT_MANAGER, UserType.TEAM_MANAGER, UserType.PROMOTER]
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

    const hashedPassword = await bcrypt.hash(password, 10);

    // Derive a unique username from the email prefix
    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let username = baseUsername;
    let counter = 1;
    while (await prisma.user.findUnique({ where: { username } })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    // Link the new user to their creator so they show up in the right
    // section on the Users page. For admin-created AMs we leave createdById
    // null (admins shouldn't own users); for everything else we stamp it.
    const createdById =
      callerIsAm || (callerIsAdmin && resolvedType !== UserType.ACCOUNT_MANAGER)
        ? caller.id
        : null;

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
        createdById,
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
    // admin via a referral so commissions can flow.
    if (callerIsAdmin && resolvedType === UserType.ACCOUNT_MANAGER) {
      const adminCampaign = await prisma.campaign.findFirst({
        where: { isActive: true, visibleToPromoters: false },
      });
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

    res.status(201).json({ user: { ...newUser, stats: { totalReferrals: 0, activeReferrals: 0, totalEarnings: 0, pendingEarnings: 0 } }, message: 'User created successfully' });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const getAccountManagers = async (_req: AuthRequest, res: Response) => {
  try {
    const managers = await prisma.user.findMany({
      where: { userType: UserType.ACCOUNT_MANAGER, isActive: true },
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
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });

    res.json({ managers });
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
