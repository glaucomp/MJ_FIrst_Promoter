import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

const isAccountManagerOrAdmin = (req: AuthRequest): boolean => {
  if (!req.user) return false;
  return (
    req.user.role === UserRole.ADMIN ||
    req.user.userType === UserType.ACCOUNT_MANAGER
  );
};

// POST /api/chatters — create a new chatter (admin or account manager)
export const createChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Only admins or account managers can create chatters' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email, password, firstName, lastName } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'A user with that email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const inviteCode = nanoid(10);

    const chatter = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        role: UserRole.PROMOTER,
        userType: UserType.CHATTER,
        inviteCode,
        isActive: true,
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

    res.status(201).json({ chatter, message: 'Chatter created successfully' });
  } catch (error) {
    console.error('Create chatter error:', error);
    res.status(500).json({ error: 'Failed to create chatter' });
  }
};

// GET /api/chatters — list all chatters
export const listChatters = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const chatters = await prisma.user.findMany({
      where: { userType: UserType.CHATTER },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        chatterGroupMemberships: {
          select: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = chatters.map((c) => ({
      ...c,
      groups: c.chatterGroupMemberships.map((m) => m.group),
      chatterGroupMemberships: undefined,
    }));

    res.json({ chatters: mapped });
  } catch (error) {
    console.error('List chatters error:', error);
    res.status(500).json({ error: 'Failed to list chatters' });
  }
};

// GET /api/chatters/:id — get a single chatter
export const getChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const chatter = await prisma.user.findFirst({
      where: { id, userType: UserType.CHATTER },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        chatterGroupMemberships: {
          select: {
            group: {
              select: { id: true, name: true, commissionPercentage: true },
            },
          },
        },
        commissions: {
          where: { type: 'chatter' },
          select: { id: true, amount: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!chatter) {
      return res.status(404).json({ error: 'Chatter not found' });
    }

    res.json({
      chatter: {
        ...chatter,
        groups: chatter.chatterGroupMemberships.map((m) => m.group),
        chatterGroupMemberships: undefined,
      },
    });
  } catch (error) {
    console.error('Get chatter error:', error);
    res.status(500).json({ error: 'Failed to get chatter' });
  }
};

// DELETE /api/chatters/:id — delete a chatter
export const deleteChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const chatter = await prisma.user.findFirst({
      where: { id, userType: UserType.CHATTER },
    });

    if (!chatter) {
      return res.status(404).json({ error: 'Chatter not found' });
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: 'Chatter deleted successfully' });
  } catch (error) {
    console.error('Delete chatter error:', error);
    res.status(500).json({ error: 'Failed to delete chatter' });
  }
};
