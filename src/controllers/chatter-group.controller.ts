import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

const isAccountManagerOrAdmin = (req: AuthRequest): boolean => {
  if (!req.user) return false;
  return (
    req.user.role === UserRole.ADMIN ||
    req.user.userType === UserType.ACCOUNT_MANAGER
  );
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
        promoter: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ group, message: 'Chatter group created successfully' });
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

    const groups = await prisma.chatterGroup.findMany({
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        members: {
          include: {
            chatter: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        promoter: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ groups });
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

    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
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
        promoter: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Chatter group not found' });
    }

    res.json({ group });
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
        promoter: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    res.json({ group, message: 'Chatter group updated successfully' });
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
