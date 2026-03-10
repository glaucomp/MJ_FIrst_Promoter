import { Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let stats: any = {};

    if (user.role === UserRole.ADMIN) {
      // Admin dashboard
      const [
        totalCampaigns,
        activeCampaigns,
        totalPromoters,
        totalReferrals,
        activeReferrals,
        totalCommissions
      ] = await Promise.all([
        prisma.campaign.count(),
        prisma.campaign.count({ where: { isActive: true } }),
        prisma.user.count({ where: { role: UserRole.PROMOTER } }),
        prisma.referral.count(),
        prisma.referral.count({ where: { status: 'ACTIVE' } }),
        prisma.commission.aggregate({
          _sum: { amount: true }
        })
      ]);

      stats = {
        totalCampaigns,
        activeCampaigns,
        totalPromoters,
        totalReferrals,
        activeReferrals,
        totalCommissions: totalCommissions._sum.amount || 0
      };
    } else {
      // Promoter dashboard
      const [
        myReferrals,
        activeReferrals,
        myCommissions,
        paidCommissions,
        trackingLinks
      ] = await Promise.all([
        prisma.referral.count({ where: { referrerId: user.id } }),
        prisma.referral.count({
          where: {
            referrerId: user.id,
            status: 'ACTIVE'
          }
        }),
        prisma.commission.aggregate({
          where: { userId: user.id },
          _sum: { amount: true }
        }),
        prisma.commission.aggregate({
          where: {
            userId: user.id,
            status: 'paid'
          },
          _sum: { amount: true }
        }),
        prisma.trackingLink.count({ where: { userId: user.id } })
      ]);

      stats = {
        totalReferrals: myReferrals,
        activeReferrals,
        totalEarnings: myCommissions._sum.amount || 0,
        paidEarnings: paidCommissions._sum.amount || 0,
        pendingEarnings: (myCommissions._sum.amount || 0) - (paidCommissions._sum.amount || 0),
        trackingLinks
      };
    }

    res.json({ stats });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

export const getRecentActivity = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const limit = parseInt(req.query.limit as string) || 10;

    let activity: any[] = [];

    if (user.role === UserRole.ADMIN) {
      // Recent campaigns and referrals
      const [recentCampaigns, recentReferrals] = await Promise.all([
        prisma.campaign.findMany({
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: {
              select: { firstName: true, lastName: true, email: true }
            }
          }
        }),
        prisma.referral.findMany({
          take: limit,
          where: { status: 'ACTIVE' },
          orderBy: { acceptedAt: 'desc' },
          include: {
            campaign: { select: { name: true } },
            referrer: { select: { firstName: true, lastName: true, email: true } },
            referredUser: { select: { firstName: true, lastName: true, email: true } }
          }
        })
      ]);

      activity = [
        ...recentCampaigns.map(c => ({
          type: 'campaign_created',
          timestamp: c.createdAt,
          data: c
        })),
        ...recentReferrals.map(r => ({
          type: 'referral_accepted',
          timestamp: r.acceptedAt || r.createdAt,
          data: r
        }))
      ].sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0)).slice(0, limit);
    } else {
      // Promoter's recent referrals
      const myReferrals = await prisma.referral.findMany({
        take: limit,
        where: { referrerId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: { select: { name: true, commissionRate: true } },
          referredUser: { select: { firstName: true, lastName: true, email: true } }
        }
      });

      activity = myReferrals.map(r => ({
        type: 'my_referral',
        timestamp: r.createdAt,
        data: r
      }));
    }

    res.json({ activity });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
};

export const getEarnings = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    const commissions = await prisma.commission.findMany({
      where: { userId: user.id },
      include: {
        campaign: {
          select: { id: true, name: true }
        },
        referral: {
          select: {
            id: true,
            level: true,
            referredUser: {
              select: { firstName: true, lastName: true, email: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const summary = {
      total: commissions.reduce((sum, c) => sum + c.amount, 0),
      paid: commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0),
      unpaid: commissions.filter(c => c.status === 'unpaid').reduce((sum, c) => sum + c.amount, 0),
      pending: commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0)
    };

    res.json({ commissions, summary });
  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
};

export const getTopPerformers = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const limit = parseInt(req.query.limit as string) || 10;

    if (user.role === UserRole.PROMOTER) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get top referrers by number of referrals
    const topReferrers = await prisma.referral.groupBy({
      by: ['referrerId'],
      where: undefined,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit
    });

    // Get user details for top referrers
    const topPerformers = await Promise.all(
      topReferrers.map(async (ref) => {
        const referrer = await prisma.user.findUnique({
          where: { id: ref.referrerId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        });

        const commissions = await prisma.commission.aggregate({
          where: { userId: ref.referrerId },
          _sum: { amount: true }
        });

        return {
          user: referrer,
          totalReferrals: ref._count.id,
          totalEarnings: commissions._sum.amount || 0
        };
      })
    );

    res.json({ topPerformers });
  } catch (error) {
    console.error('Get top performers error:', error);
    res.status(500).json({ error: 'Failed to fetch top performers' });
  }
};
