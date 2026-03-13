import { Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { validationResult } from 'express-validator';
import { nanoid } from 'nanoid';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export const createReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { campaignId, email } = req.body;
    const user = req.user!;

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Check if campaign is active
    if (!campaign.isActive) {
      return res.status(400).json({ error: 'Cannot create invites for inactive campaigns' });
    }
    
    // Promoters can invite for any active campaign they're participating in
    if (user.role === UserRole.PROMOTER) {
      // Check if promoter is already part of this campaign (has been referred to it)
      const isParticipant = await prisma.referral.findFirst({
        where: {
          campaignId,
          OR: [
            { referrerId: user.id },
            { referredUserId: user.id }
          ]
        }
      });
      
      // If not a participant yet and campaign requires approval, block
      if (!isParticipant && !campaign.autoApprove) {
        return res.status(403).json({ error: 'You must be approved for this campaign before inviting others' });
      }
    }

    // Generate unique invite code
    const inviteCode = nanoid(10);

    // Determine referral level
    let level = 1;
    let parentReferralId = null;

    // If the user is an influencer, this is a second-level referral
    if (user.role === UserRole.PROMOTER) {
      // Find the referral where this user was referred
      const userReferral = await prisma.referral.findFirst({
        where: {
          campaignId,
          referredUserId: user.id
        }
      });

      if (userReferral) {
        level = userReferral.level + 1;
        parentReferralId = userReferral.id;
      }
    }

    const referral = await prisma.referral.create({
      data: {
        inviteCode,
        campaignId,
        referrerId: user.id,
        level,
        parentReferralId,
        status: 'PENDING'
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
            defaultReferralUrl: true,
            commissionRate: true,
            secondaryRate: true
          }
        },
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Get full user with username
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true, inviteCode: true }
    });

    // Use username as the ref code
    const refCode = fullUser?.username || fullUser?.inviteCode || user.id;

    // Generate invite URL - use campaign's defaultReferralUrl or websiteUrl
    const targetUrl = referral.campaign.defaultReferralUrl || referral.campaign.websiteUrl;
    
    // Parse URL and add tracking parameter with username
    const urlObj = new URL(targetUrl);
    urlObj.searchParams.set('fpr', refCode);
    
    const inviteUrl = urlObj.toString();

    res.status(201).json({
      referral,
      inviteUrl,
      inviteCode,
      message: 'Referral invite created successfully'
    });
  } catch (error) {
    console.error('Create referral error:', error);
    res.status(500).json({ error: 'Failed to create referral invite' });
  }
};

export const getReferralByInviteCode = async (req: AuthRequest, res: Response) => {
  try {
    const { inviteCode } = req.params;

    const referral = await prisma.referral.findUnique({
      where: { inviteCode },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            websiteUrl: true,
            commissionRate: true,
            isActive: true
          }
        },
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!referral) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    if (referral.referredUserId) {
      return res.status(400).json({ error: 'This invite code has already been used' });
    }

    if (!referral.campaign.isActive) {
      return res.status(400).json({ error: 'This campaign is no longer active' });
    }

    res.json({ referral });
  } catch (error) {
    console.error('Get referral error:', error);
    res.status(500).json({ error: 'Failed to fetch referral' });
  }
};

export const getMyReferrals = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    const referrals = await prisma.referral.findMany({
      where: { referrerId: user.id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
            commissionRate: true
          }
        },
        referredUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true
          }
        },
        childReferrals: {
          include: {
            referredUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        commissions: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate total earnings
    const totalEarnings = referrals.reduce((sum, ref) => {
      return sum + ref.commissions.reduce((commSum, comm) => commSum + comm.amount, 0);
    }, 0);

    res.json({
      referrals,
      totalEarnings,
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter(r => r.status === 'ACTIVE').length
    });
  } catch (error) {
    console.error('Get my referrals error:', error);
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
};

export const getReferralById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        campaign: true,
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        referredUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        parentReferral: {
          include: {
            referrer: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        childReferrals: {
          include: {
            referredUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        commissions: true
      }
    });

    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    // Check permissions
    if (
      user.role !== UserRole.ADMIN &&
      referral.referrerId !== user.id &&
      referral.referredUserId !== user.id
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ referral });
  } catch (error) {
    console.error('Get referral error:', error);
    res.status(500).json({ error: 'Failed to fetch referral' });
  }
};

export const generateTrackingLink = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { campaignId } = req.body;
    const userId = req.user!.id;

    // Get full user with username
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Use username as short code (fallback to user.id if no username)
    const shortCode = user.username || user.id;

    // Get campaign website URL
    const campaignWebsiteUrl = campaign.websiteUrl || campaign.defaultReferralUrl;
    if (!campaignWebsiteUrl) {
      return res.status(400).json({ error: 'Campaign URL not configured' });
    }
    
    // Create tracking link using campaign's actual URL with fpr parameter
    const urlObj = new URL(campaignWebsiteUrl);
    urlObj.searchParams.set('fpr', shortCode);
    const fullUrl = urlObj.toString();

    const trackingLink = await prisma.trackingLink.create({
      data: {
        shortCode,
        fullUrl,
        userId: user.id,
        campaignId
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      trackingLink,
      message: 'Tracking link created successfully'
    });
  } catch (error) {
    console.error('Generate tracking link error:', error);
    res.status(500).json({ error: 'Failed to generate tracking link' });
  }
};

export const getMyTrackingLinks = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    const trackingLinks = await prisma.trackingLink.findMany({
      where: { userId: user.id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true
          }
        },
        _count: {
          select: { clickTracking: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ trackingLinks });
  } catch (error) {
    console.error('Get tracking links error:', error);
    res.status(500).json({ error: 'Failed to fetch tracking links' });
  }
};

export const trackClick = async (req: AuthRequest, res: Response) => {
  try {
    const { shortCode, ipAddress, userAgent, referrerUrl } = req.body;

    const trackingLink = await prisma.trackingLink.findUnique({
      where: { shortCode },
      include: { campaign: true }
    });

    if (!trackingLink) {
      return res.status(404).json({ error: 'Tracking link not found' });
    }

    // Create click tracking record
    await prisma.clickTracking.create({
      data: {
        trackingLinkId: trackingLink.id,
        userId: trackingLink.userId,
        ipAddress,
        userAgent,
        referrerUrl
      }
    });

    // Increment click count
    await prisma.trackingLink.update({
      where: { id: trackingLink.id },
      data: { clicks: { increment: 1 } }
    });

    // Return the campaign website URL to redirect to
    res.json({
      redirectUrl: trackingLink.campaign.websiteUrl,
      campaignName: trackingLink.campaign.name
    });
  } catch (error) {
    console.error('Track click error:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
};
