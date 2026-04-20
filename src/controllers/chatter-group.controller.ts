import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { getPresignedUrl } from '../services/s3.service';
import { syncUserFromTeaseMe } from '../services/teaseme.service';

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
 * Deduped by promoter id, bounded concurrency, failures are swallowed so
 * the response is never blocked on outbound latency.
 */
const refreshStalePromoters = async <
  T extends {
    promoter: { id: string; username: string | null; teasemeSyncedAt: Date | null } | null;
  },
>(
  groups: T[],
): Promise<void> => {
  const now = Date.now();
  const toSync = new Map<string, string>();
  for (const g of groups) {
    const p = g.promoter;
    if (!p?.username || toSync.has(p.id)) continue;
    const lastSyncedAt = p.teasemeSyncedAt ? p.teasemeSyncedAt.getTime() : null;
    const isStale = lastSyncedAt === null || now - lastSyncedAt > TEASEME_SYNC_TTL_MS;
    if (isStale) toSync.set(p.id, p.username);
  }
  if (toSync.size === 0) return;

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

    res.status(201).json({ group: await hydratePromoterPhoto(group), message: 'Chatter group created successfully' });
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
    await refreshStalePromoters(groups);
    // Re-read so we pick up rows written by the sync above (social_links, voiceId, etc.).
    groups = await prisma.chatterGroup.findMany(listQuery);

    const hydratedGroups = await Promise.all(groups.map(hydratePromoterPhoto));
    res.json({ groups: hydratedGroups });
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

    res.json({ group: await hydratePromoterPhoto(group) });
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

    const existing = await prisma.chatterGroup.findUnique({ where: { id } });
    if (!existing) {
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

    res.json({ group: await hydratePromoterPhoto(group), message: 'Chatter group updated successfully' });
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

    const existing = await prisma.chatterGroup.findUnique({ where: { id } });
    if (!existing) {
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

    const group = await prisma.chatterGroup.findUnique({ where: { id } });
    if (!group) {
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

    const group = await prisma.chatterGroup.findUnique({ where: { id } });
    if (!group) {
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
