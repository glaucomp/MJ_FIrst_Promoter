import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { getPresignedUrl } from '../services/s3.service';
import { syncUserFromTeaseMe } from '../services/teaseme.service';
import { resolveAccountManagersFor } from '../services/ownership.service';

const prisma = new PrismaClient();

// Keep this in sync with SYNC_TTL_MS in `chatter.controller.ts`. We re-pull TeaseMe
// data (voice, photo, video, social_links) when the cached copy is older than this.
const TEASEME_SYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const isAccountManagerOrAdmin = (req: AuthRequest): boolean => {
  if (!req.user) return false;
  return (
    req.user.role === UserRole.ADMIN ||
    req.user.userType === UserType.ACCOUNT_MANAGER
  );
};

const isAdmin = (req: AuthRequest): boolean => req.user?.role === UserRole.ADMIN;

// Returns true when the caller is allowed to read/modify the given group.
// Admins can touch any group. Account managers see groups where either they
// created the group, or the group's linked promoter / creator / any chatter
// member resolves to the caller as their effective account manager (same
// ownership rule as `listChatterGroups`). The check is async because it walks
// the referral/createdBy graph.
const canAccessGroupById = async (
  req: AuthRequest,
  groupId: string,
): Promise<boolean> => {
  if (isAdmin(req)) {
    const exists = await prisma.chatterGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    return !!exists;
  }

  const callerId = req.user!.id;
  const group = await prisma.chatterGroup.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      promoter: { select: { id: true } },
      members: { select: { chatterId: true } },
    },
  });
  if (!group) return false;
  if (group.createdById === callerId) return true;

  const ids = new Set<string>();
  if (group.createdById) ids.add(group.createdById);
  if (group.promoter?.id) ids.add(group.promoter.id);
  for (const m of group.members) {
    if (m.chatterId) ids.add(m.chatterId);
  }
  if (ids.size === 0) return false;

  const amByUser = await resolveAccountManagersFor(Array.from(ids));
  for (const uid of ids) {
    if (amByUser.get(uid) === callerId) return true;
  }
  return false;
};

// Shared promoter select + photo-key hydration helpers so every chatter-group
// response exposes a short-lived presigned `photoUrl` without leaking S3 keys.
const promoterSelectWithPhoto = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  profilePhotoKey: true,
  teasemeSyncedAt: true,
} as const;

/**
 * Re-syncs any promoter whose TeaseMe cache is stale (or never synced).
 * Deduped by promoter id, bounded concurrency, and individual sync failures
 * are swallowed. Callers that `await` this helper will still wait for the
 * outbound TeaseMe sync work to complete.
 */
const refreshStalePromoters = async <
  T extends {
    promoter: { id: string; username: string | null; teasemeSyncedAt: Date | null } | null;
  },
>(
  groups: T[],
): Promise<boolean> => {
  const now = Date.now();
  const toSync = new Map<string, string>();
  for (const g of groups) {
    const p = g.promoter;
    if (!p?.username || toSync.has(p.id)) continue;
    const lastSyncedAt = p.teasemeSyncedAt ? p.teasemeSyncedAt.getTime() : null;
    const isStale = lastSyncedAt === null || now - lastSyncedAt > TEASEME_SYNC_TTL_MS;
    if (isStale) toSync.set(p.id, p.username);
  }
  if (toSync.size === 0) return false;

  const queue = Array.from(toSync.entries()); // [id, username]
  const concurrency = Math.min(3, queue.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const index = cursor++;
      const [id, username] = queue[index];
      try {
        await syncUserFromTeaseMe(id);
      } catch (err) {
        console.error(
          `[chatter-group.refreshStalePromoters] TeaseMe sync failed for ${username}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return true;
};

type GroupWithPromoterPhoto<T> = T & {
  promoter:
    | (Omit<NonNullable<T extends { promoter: infer P } ? P : never>, 'profilePhotoKey'> & {
        photoUrl: string | null;
      })
    | null;
};

const hydratePromoterPhoto = async <
  T extends { promoter: { profilePhotoKey?: string | null } | null },
>(
  group: T,
): Promise<GroupWithPromoterPhoto<T>> => {
  if (!group.promoter) {
    return { ...group, promoter: null } as GroupWithPromoterPhoto<T>;
  }
  const { profilePhotoKey, ...rest } = group.promoter;
  const photoUrl = await getPresignedUrl(profilePhotoKey);
  return { ...group, promoter: { ...rest, photoUrl } } as GroupWithPromoterPhoto<T>;
};

// Group "account manager" exposed to the client: the AM effectively
// responsible for the group. Priority: the linked promoter's AM → the group's
// creator (if they are an AM) → the first member chatter's AM. Returns null
// when we can't resolve anyone — the UI surfaces that as "Unassigned".
type GroupLike = {
  createdById: string | null;
  createdBy: { id: string } | null;
  promoter: { id: string } | null;
  members: Array<{ chatter: { id: string } | null }>;
};

const attachAccountManagers = async <T extends GroupLike>(
  groups: T[],
): Promise<Array<T & { accountManager: AccountManagerSummary | null }>> => {
  // Collect every candidate user id across all groups so we resolve the
  // referral/createdBy graph in one pass.
  const candidateIds = new Set<string>();
  for (const g of groups) {
    if (g.promoter?.id) candidateIds.add(g.promoter.id);
    if (g.createdBy?.id) candidateIds.add(g.createdBy.id);
    for (const m of g.members) {
      if (m.chatter?.id) candidateIds.add(m.chatter.id);
    }
  }
  if (candidateIds.size === 0) {
    return groups.map((g) => ({ ...g, accountManager: null }));
  }

  const amByUser = await resolveAccountManagersFor(Array.from(candidateIds));

  // Hydrate AM user summaries once (id → {name, email, ...}).
  const amIds = new Set<string>();
  for (const amId of amByUser.values()) {
    if (amId) amIds.add(amId);
  }
  const amUsers = amIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(amIds) } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
        },
      })
    : [];
  const amById = new Map(amUsers.map((u) => [u.id, u]));

  const pickAmId = (g: GroupLike): string | null => {
    // Promoter first — the group exists to serve chatters of this promoter.
    if (g.promoter?.id) {
      const amId = amByUser.get(g.promoter.id);
      if (amId) return amId;
    }
    // Then the group creator (only if creator resolves to an AM — admins do not).
    if (g.createdBy?.id) {
      const amId = amByUser.get(g.createdBy.id);
      if (amId) return amId;
    }
    // Finally any member chatter's AM.
    for (const m of g.members) {
      if (!m.chatter?.id) continue;
      const amId = amByUser.get(m.chatter.id);
      if (amId) return amId;
    }
    return null;
  };

  return groups.map((g) => {
    const amId = pickAmId(g);
    const am = amId ? amById.get(amId) ?? null : null;
    return {
      ...g,
      accountManager: am
        ? {
            id: am.id,
            email: am.email,
            firstName: am.firstName,
            lastName: am.lastName,
            userType: am.userType,
          }
        : null,
    };
  });
};

type AccountManagerSummary = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  userType: UserType;
};

// POST /api/chatter-groups — create a new chatter group
export const createChatterGroup = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Only admins or account managers can create chatter groups' });
    }

    const { name, commissionPercentage, tag } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const pct = Number(commissionPercentage);
    if (commissionPercentage == null || Number.isNaN(pct)) {
      return res.status(400).json({ error: 'commissionPercentage is required and must be a number' });
    }
    if (pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'commissionPercentage must be between 0 and 100' });
    }

    const group = await prisma.chatterGroup.create({
      data: {
        name,
        tag: tag == null ? null : String(tag).trim() || null,
        commissionPercentage: pct,
        createdById: req.user!.id,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        members: {
          include: {
            chatter: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        promoter: { select: promoterSelectWithPhoto },
      },
    });

    const hydrated = await hydratePromoterPhoto(group);
    const [withAm] = await attachAccountManagers([hydrated]);
    res.status(201).json({ group: withAm, message: 'Chatter group created successfully' });
  } catch (error) {
    console.error('Create chatter group error:', error);
    res.status(500).json({ error: 'Failed to create chatter group' });
  }
};

// GET /api/chatter-groups — list all chatter groups
export const listChatterGroups = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Only admins or account managers can list chatter groups' });
    }

    const listQuery = {
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        members: {
          include: {
            chatter: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        promoter: { select: promoterSelectWithPhoto },
      },
      orderBy: { createdAt: 'desc' },
    } as const;

    let groups = await prisma.chatterGroup.findMany(listQuery);

    // Refresh any stale TeaseMe data (voice, photo, video, social_links) before responding.
    const didAttemptRefresh = await refreshStalePromoters(groups);
    if (didAttemptRefresh) {
      // Re-read so we pick up rows written by the sync above (social_links, voiceId, etc.).
      groups = await prisma.chatterGroup.findMany(listQuery);
    }

    // For account managers, expand visibility beyond "groups I created":
    // show any group whose linked promoter, member chatter, or creator
    // resolves to the caller as its *effective* Account Manager. This keeps
    // chatter-group visibility aligned with user ownership (incl. transitive
    // referral chains and admin-created groups delegated to the AM).
    let visibleGroups = groups;
    if (!isAdmin(req)) {
      const callerId = req.user!.id;
      const relevantUserIds = new Set<string>();
      for (const g of groups) {
        if (g.promoter?.id) relevantUserIds.add(g.promoter.id);
        if (g.createdBy?.id) relevantUserIds.add(g.createdBy.id);
        for (const m of g.members) {
          if (m.chatter?.id) relevantUserIds.add(m.chatter.id);
        }
      }
      const amByUser = await resolveAccountManagersFor(Array.from(relevantUserIds));
      const ownsUser = (uid: string | null | undefined) =>
        !!uid && (uid === callerId || amByUser.get(uid) === callerId);

      visibleGroups = groups.filter((g) => {
        if (g.createdById === callerId) return true;
        if (ownsUser(g.promoter?.id)) return true;
        if (ownsUser(g.createdBy?.id)) return true;
        return g.members.some((m) => ownsUser(m.chatter?.id));
      });
    }

    const hydratedGroups = await Promise.all(visibleGroups.map(hydratePromoterPhoto));
    const withAm = await attachAccountManagers(hydratedGroups);
    res.json({ groups: withAm });
  } catch (error) {
    console.error('List chatter groups error:', error);
    res.status(500).json({ error: 'Failed to list chatter groups' });
  }
};

// GET /api/chatter-groups/:id — get a single chatter group
export const getChatterGroup = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Only admins or account managers can view chatter groups' });
    }

    const { id } = req.params;

    const group = await prisma.chatterGroup.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        members: {
          include: {
            chatter: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        promoter: { select: promoterSelectWithPhoto },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    const canAccessLoadedGroup =
      req.user?.role === UserRole.ADMIN ||
      group.createdBy?.id === req.user?.id;

    if (!canAccessLoadedGroup && !(await canAccessGroupById(req, id))) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    const hydrated = await hydratePromoterPhoto(group);
    const [withAm] = await attachAccountManagers([hydrated]);
    res.json({ group: withAm });
  } catch (error) {
    console.error('Get chatter group error:', error);
    res.status(500).json({ error: 'Failed to get chatter group' });
  }
};

// PUT /api/chatter-groups/:id — update a chatter group's name or commission percentage
export const updateChatterGroup = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { name, commissionPercentage, tag } = req.body;

    if (!(await canAccessGroupById(req, id))) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    const data: { name?: string; commissionPercentage?: number; tag?: string | null } = {};

    if (name !== undefined) data.name = name;
    if (tag !== undefined) {
      const trimmedTag = String(tag).trim();
      data.tag = trimmedTag === '' ? null : trimmedTag;
    }

    if (commissionPercentage !== undefined) {
      const pct = Number(commissionPercentage);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: 'commissionPercentage must be between 0 and 100' });
      }
      data.commissionPercentage = pct;
    }

    const group = await prisma.chatterGroup.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        members: {
          include: {
            chatter: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        promoter: { select: promoterSelectWithPhoto },
      },
    });

    const hydrated = await hydratePromoterPhoto(group);
    const [withAm] = await attachAccountManagers([hydrated]);
    res.json({ group: withAm, message: 'Chatter group updated successfully' });
  } catch (error) {
    console.error('Update chatter group error:', error);
    res.status(500).json({ error: 'Failed to update chatter group' });
  }
};

// DELETE /api/chatter-groups/:id — delete a chatter group
export const deleteChatterGroup = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    if (!(await canAccessGroupById(req, id))) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    await prisma.chatterGroup.delete({ where: { id } });

    res.json({ message: 'Chatter group deleted successfully' });
  } catch (error) {
    console.error('Delete chatter group error:', error);
    res.status(500).json({ error: 'Failed to delete chatter group' });
  }
};

// POST /api/chatter-groups/:id/members — add a chatter to a group
export const addMember = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { chatterId } = req.body;

    if (!chatterId) {
      return res.status(400).json({ error: 'chatterId is required' });
    }

    if (!(await canAccessGroupById(req, id))) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    const chatter = await prisma.user.findFirst({
      where: { id: chatterId, userType: UserType.CHATTER },
    });
    if (!chatter) {
      return res.status(404).json({ error: 'Chatter not found' });
    }

    const member = await prisma.chatterGroupMember.create({
      data: { chatterId, groupId: id },
      include: {
        chatter: { select: { id: true, email: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ member, message: 'Chatter added to group' });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Chatter is already a member of this group' });
    }
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member to chatter group' });
  }
};

// DELETE /api/chatter-groups/:id/members/:chatterId — remove a chatter from a group
export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id, chatterId } = req.params;

    if (!(await canAccessGroupById(req, id))) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    const member = await prisma.chatterGroupMember.findUnique({
      where: { chatterId_groupId: { chatterId, groupId: id } },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found in this group' });
    }

    await prisma.chatterGroupMember.delete({
      where: { chatterId_groupId: { chatterId, groupId: id } },
    });

    res.json({ message: 'Chatter removed from group' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member from chatter group' });
  }
};

// PUT /api/chatter-groups/:id/promoter — link a promoter to a chatter group
export const linkPromoter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const { promoterId } = req.body;

    if (!promoterId) {
      return res.status(400).json({ error: 'promoterId is required' });
    }

    if (!(await canAccessGroupById(req, id))) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    const promoter = await prisma.user.findFirst({
      where: {
        id: promoterId,
        userType: { in: [UserType.PROMOTER, UserType.TEAM_MANAGER] },
      },
    });
    if (!promoter) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    // If this group already has a different promoter linked, unlink them first
    const existingPromoter = await prisma.user.findFirst({
      where: { chatterGroupId: id },
    });
    if (existingPromoter && existingPromoter.id !== promoterId) {
      await prisma.user.update({
        where: { id: existingPromoter.id },
        data: { chatterGroupId: null },
      });
    }

    // If promoter is already linked to a different group, move them
    const updatedPromoter = await prisma.user.update({
      where: { id: promoterId },
      data: { chatterGroupId: id },
      select: { id: true, email: true, firstName: true, lastName: true, chatterGroupId: true },
    });

    res.json({ promoter: updatedPromoter, message: 'Promoter linked to chatter group' });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'This promoter is already linked to a chatter group' });
    }
    console.error('Link promoter error:', error);
    res.status(500).json({ error: 'Failed to link promoter to chatter group' });
  }
};

// DELETE /api/chatter-groups/:id/promoter/:promoterId — unlink a promoter
export const unlinkPromoter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id, promoterId } = req.params;

    if (!(await canAccessGroupById(req, id))) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    const promoter = await prisma.user.findFirst({
      where: { id: promoterId, chatterGroupId: id },
    });

    if (!promoter) {
      return res.status(404).json({ error: 'Promoter is not linked to this group' });
    }

    await prisma.user.update({
      where: { id: promoterId },
      data: { chatterGroupId: null },
    });

    res.json({ message: 'Promoter unlinked from chatter group' });
  } catch (error) {
    console.error('Unlink promoter error:', error);
    res.status(500).json({ error: 'Failed to unlink promoter from chatter group' });
  }
};
