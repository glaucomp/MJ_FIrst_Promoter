import { PrismaClient, UserType } from '@prisma/client';

const prisma = new PrismaClient();

interface BasicUser {
  id: string;
  userType: UserType;
  isActive: boolean;
  createdById: string | null;
}

/**
 * Walks the explicit `createdBy` link and the active referral chain to find
 * the first active Account Manager for a set of users. Used wherever we need
 * to answer "which AM effectively owns this user?" — which for chatter groups
 * includes the linked promoter and any chatter members.
 *
 * Returns a `Map<userId, accountManagerId | null>` covering every id in
 * `userIds`. Ids that don't resolve to an active AM map to `null`.
 */
export const resolveAccountManagersFor = async (
  userIds: string[],
): Promise<Map<string, string | null>> => {
  const result = new Map<string, string | null>();
  if (userIds.length === 0) return result;

  // Load every user + every active referral so we can walk the full graph.
  // This mirrors the logic in `user.controller.ts#getAllUsers` so a group's
  // "effective AM" stays consistent with a user's "effective AM".
  const allBasicUsers = await prisma.user.findMany({
    select: {
      id: true,
      userType: true,
      isActive: true,
      createdById: true,
    },
  });
  const userById = new Map<string, BasicUser>(
    allBasicUsers.map((u) => [u.id, u as BasicUser]),
  );

  const activeReferrals = await prisma.referral.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { acceptedAt: 'asc' },
    select: { referrerId: true, referredUserId: true },
  });
  const incomingByUser = new Map<string, string[]>();
  for (const r of activeReferrals) {
    if (!r.referredUserId) continue;
    const arr = incomingByUser.get(r.referredUserId) ?? [];
    arr.push(r.referrerId);
    incomingByUser.set(r.referredUserId, arr);
  }

  const isActiveAm = (u: BasicUser | undefined | null) =>
    !!u && u.userType === UserType.ACCOUNT_MANAGER && u.isActive !== false;

  const cache = new Map<string, string | null>();
  const resolve = (userId: string, seen: Set<string> = new Set()): string | null => {
    if (cache.has(userId)) return cache.get(userId)!;
    if (seen.has(userId)) return null;
    seen.add(userId);

    const u = userById.get(userId);
    if (!u) {
      cache.set(userId, null);
      return null;
    }

    // 0. The user is themselves an active AM — they own themselves. This makes
    //    the resolver idempotent for AMs so callers can pass any user id.
    if (isActiveAm(u)) {
      cache.set(userId, u.id);
      return u.id;
    }

    // 1. Explicit createdBy
    const createdBy = u.createdById ? userById.get(u.createdById) : null;
    if (isActiveAm(createdBy)) {
      cache.set(userId, createdBy!.id);
      return createdBy!.id;
    }

    // 2. Direct active referrer (earliest wins — referrals were ordered)
    const referrerIds = incomingByUser.get(userId) ?? [];
    for (const refId of referrerIds) {
      const ref = userById.get(refId);
      if (isActiveAm(ref)) {
        cache.set(userId, ref!.id);
        return ref!.id;
      }
    }

    // 3. Transitive upstream via referrers, then via createdBy
    for (const refId of referrerIds) {
      const upstream = resolve(refId, seen);
      if (upstream) {
        cache.set(userId, upstream);
        return upstream;
      }
    }
    if (createdBy) {
      const upstream = resolve(createdBy.id, seen);
      if (upstream) {
        cache.set(userId, upstream);
        return upstream;
      }
    }

    cache.set(userId, null);
    return null;
  };

  for (const id of userIds) {
    result.set(id, resolve(id));
  }
  return result;
};
