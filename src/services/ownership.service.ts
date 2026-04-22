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

  const requestedIds = [...new Set(userIds)];
  const userById = new Map<string, BasicUser>();
  const incomingByUser = new Map<string, string[]>();
  const loadedUserIds = new Set<string>();
  const loadedReferralTargets = new Set<string>();

  const loadUsers = async (ids: string[]) => {
    const idsToLoad = [...new Set(ids)].filter((id) => !loadedUserIds.has(id));
    if (idsToLoad.length === 0) return;

    const users = await prisma.user.findMany({
      where: { id: { in: idsToLoad } },
      select: {
        id: true,
        userType: true,
        isActive: true,
        createdById: true,
      },
    });

    for (const user of users) {
      userById.set(user.id, user as BasicUser);
    }
    for (const id of idsToLoad) {
      loadedUserIds.add(id);
    }
  };

  const loadIncomingReferrals = async (referredUserIds: string[]) => {
    const idsToLoad = [...new Set(referredUserIds)].filter(
      (id) => !loadedReferralTargets.has(id),
    );
    if (idsToLoad.length === 0) return;

    const referrals = await prisma.referral.findMany({
      where: {
        status: 'ACTIVE',
        referredUserId: { in: idsToLoad },
      },
      orderBy: { acceptedAt: 'asc' },
      select: { referrerId: true, referredUserId: true },
    });

    for (const referral of referrals) {
      if (!referral.referredUserId) continue;
      const arr = incomingByUser.get(referral.referredUserId) ?? [];
      arr.push(referral.referrerId);
      incomingByUser.set(referral.referredUserId, arr);
    }
    for (const id of idsToLoad) {
      loadedReferralTargets.add(id);
    }
  };

  // Load only the upstream subgraph reachable from the requested users via
  // createdBy and active referral edges.
  let frontier = requestedIds;
  while (frontier.length > 0) {
    await loadUsers(frontier);
    await loadIncomingReferrals(frontier);

    const nextFrontier = new Set<string>();
    for (const id of frontier) {
      const user = userById.get(id);
      if (user?.createdById && !loadedUserIds.has(user.createdById)) {
        nextFrontier.add(user.createdById);
      }

      const referrerIds = incomingByUser.get(id) ?? [];
      for (const referrerId of referrerIds) {
        if (!loadedUserIds.has(referrerId)) {
          nextFrontier.add(referrerId);
        }
      }
    }

    frontier = [...nextFrontier];
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
