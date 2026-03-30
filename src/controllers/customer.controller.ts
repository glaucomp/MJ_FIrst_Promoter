import { Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export const getAllCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const customers = await prisma.customer.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            name: true
          }
        },
        referral: {
          include: {
            referrer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ customers });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

export const getCustomerById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    if (user.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            commissionRate: true,
            secondaryRate: true
          }
        },
        referral: {
          include: {
            referrer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            campaign: {
              select: {
                name: true
              }
            }
          }
        },
        commissions: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
};
