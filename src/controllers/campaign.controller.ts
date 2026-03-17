import { Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export const createCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      name, 
      description, 
      websiteUrl,
      defaultReferralUrl,
      commissionRate, 
      secondaryRate, 
      recurringRate,
      cookieLifeDays,
      autoApprove,
      visibleToPromoters,
      referralDiscount,
      referralReward,
      maxInvitesPerMonth,
      startDate, 
      endDate 
    } = req.body;

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description,
        websiteUrl,
        defaultReferralUrl: defaultReferralUrl || null,
        commissionRate: parseFloat(commissionRate),
        secondaryRate: secondaryRate ? parseFloat(secondaryRate) : null,
        recurringRate: recurringRate ? parseFloat(recurringRate) : null,
        cookieLifeDays: cookieLifeDays ? parseInt(cookieLifeDays) : 60,
        autoApprove: autoApprove !== undefined ? autoApprove : true,
        visibleToPromoters: visibleToPromoters !== undefined ? visibleToPromoters : true,
        referralDiscount: referralDiscount ? parseFloat(referralDiscount) : null,
        referralReward: referralReward ? parseFloat(referralReward) : null,
        maxInvitesPerMonth: maxInvitesPerMonth && parseInt(maxInvitesPerMonth) > 0 ? parseInt(maxInvitesPerMonth) : null,
        createdById: req.user!.id,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null
      },
      include: {
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    res.status(201).json({ campaign });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

export const getAllCampaigns = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let campaigns;

    if (user.role === UserRole.ADMIN) {
      // Admin sees all campaigns
      campaigns = await prisma.campaign.findMany({
        include: {
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          _count: {
            select: { referrals: true, commissions: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // Check if user is an account manager (top-level referrer who invites others)
      const isAccountManager = await prisma.referral.findFirst({
        where: {
          referrerId: user.id,
          parentReferralId: null
        },
      });

      // Promoters see active campaigns
      // Account managers see ALL active campaigns
      // Regular influencers only see campaigns where visibleToPromoters: true
      campaigns = await prisma.campaign.findMany({
        where: {
          isActive: true,
          ...(isAccountManager ? {} : { visibleToPromoters: true })
        },
        include: {
          _count: {
            select: { referrals: true, commissions: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json({ campaigns });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
};

export const getCampaignById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        referrals: {
          include: {
            referrer: {
              select: { id: true, email: true, firstName: true, lastName: true }
            },
            referredUser: {
              select: { id: true, email: true, firstName: true, lastName: true }
            }
          }
        },
        _count: {
          select: { referrals: true, commissions: true }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Check permissions
    const user = req.user!;
    if (user.role !== UserRole.ADMIN) {
      // Promoter must be part of the campaign
      const isParticipant = campaign.referrals.some(
        r => r.referrerId === user.id || r.referredUserId === user.id
      );
      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
};

export const updateCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      websiteUrl,
      defaultReferralUrl,
      commissionRate, 
      secondaryRate, 
      recurringRate,
      cookieLifeDays,
      autoApprove,
      visibleToPromoters,
      referralDiscount,
      referralReward,
      maxInvitesPerMonth,
      isActive, 
      endDate 
    } = req.body;

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(websiteUrl && { websiteUrl }),
        ...(defaultReferralUrl !== undefined && { defaultReferralUrl: defaultReferralUrl || null }),
        ...(commissionRate && { commissionRate: parseFloat(commissionRate) }),
        ...(secondaryRate !== undefined && { secondaryRate: secondaryRate ? parseFloat(secondaryRate) : null }),
        ...(recurringRate !== undefined && { recurringRate: recurringRate ? parseFloat(recurringRate) : null }),
        ...(cookieLifeDays && { cookieLifeDays: parseInt(cookieLifeDays) }),
        ...(autoApprove !== undefined && { autoApprove }),
        ...(visibleToPromoters !== undefined && { visibleToPromoters }),
        ...(referralDiscount !== undefined && { referralDiscount: referralDiscount ? parseFloat(referralDiscount) : null }),
        ...(referralReward !== undefined && { referralReward: referralReward ? parseFloat(referralReward) : null }),
        ...(maxInvitesPerMonth !== undefined && { maxInvitesPerMonth: maxInvitesPerMonth && parseInt(maxInvitesPerMonth) > 0 ? parseInt(maxInvitesPerMonth) : null }),
        ...(isActive !== undefined && { isActive }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null })
      },
      include: {
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    res.json({ campaign });
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
};

export const deleteCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.campaign.delete({
      where: { id }
    });

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
};

export const getCampaignStats = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            referrals: true,
            commissions: true,
            trackingLinks: true
          }
        },
        referrals: {
          where: { status: 'ACTIVE' },
          include: {
            referredUser: true
          }
        },
        commissions: {
          select: {
            amount: true,
            status: true
          }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const totalCommissions = campaign.commissions.reduce((sum, c) => sum + c.amount, 0);
    const paidCommissions = campaign.commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0);
    const activeReferrals = campaign.referrals.filter(r => r.status === 'ACTIVE').length;

    const stats = {
      totalReferrals: campaign._count.referrals,
      activeReferrals,
      totalCommissions,
      paidCommissions,
      unpaidCommissions: totalCommissions - paidCommissions,
      trackingLinks: campaign._count.trackingLinks
    };

    res.json({ stats });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign statistics' });
  }
};
