import { Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth.middleware';

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
        role: UserRole.ADMIN
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
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
    const { role, search } = req.query;

    const where: any = {};
    
    if (role) {
      where.role = role as UserRole;
    }

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } }
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
        isActive: true,
        createdAt: true,
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

    // Calculate real stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const referrals = await prisma.referral.findMany({
          where: { referrerId: user.id }
        });

        const commissions = await prisma.commission.findMany({
          where: { userId: user.id }
        });

        return {
          ...user,
          stats: {
            totalReferrals: referrals.length,
            activeReferrals: referrals.filter(r => r.status === 'ACTIVE').length,
            totalEarnings: commissions.reduce((sum, c) => sum + c.amount, 0),
            pendingEarnings: commissions.filter(c => c.status === 'unpaid' || c.status === 'pending').reduce((sum, c) => sum + c.amount, 0)
          }
        };
      })
    );

    res.json({ users: usersWithStats });
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
    const { firstName, lastName, email, password } = req.body;

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

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
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

export const getAccountManagers = async (req: AuthRequest, res: Response) => {
  try {
    const managers = await prisma.user.findMany({
      where: { role: UserRole.PROMOTER, isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        _count: {
          select: {
            createdCampaigns: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ managers });
  } catch (error) {
    console.error('Get account managers error:', error);
    res.status(500).json({ error: 'Failed to fetch account managers' });
  }
};
