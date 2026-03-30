import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Track click from ?ref=username or ?fpr=code URL parameter
export const trackClickByRef = async (req: Request, res: Response) => {
  try {
    const { ref, fpr, campaignId, ipAddress, userAgent, referrerUrl } = req.body;
    
    // Accept both 'ref' and 'fpr' parameters
    const refCode = ref || fpr;

    if (!refCode) {
      return res.status(400).json({ error: 'Missing ref or fpr parameter' });
    }

    // Find user by username or inviteCode
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: refCode },
          { inviteCode: refCode }
        ]
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Get or use default campaign
    let campaign;
    if (campaignId) {
      campaign = await prisma.campaign.findUnique({
        where: { id: campaignId }
      });
    } else {
      // Use first active campaign
      campaign = await prisma.campaign.findFirst({
        where: {
          isActive: true,
          visibleToPromoters: true
        }
      });
    }

    if (!campaign) {
      return res.status(404).json({ error: 'No active campaign found' });
    }

    // Find or create tracking link for this user
    let trackingLink = await prisma.trackingLink.findFirst({
      where: {
        userId: user.id,
        campaignId: campaign.id,
        shortCode: user.username || user.id
      }
    });

    if (!trackingLink) {
      // Create tracking link if it doesn't exist
      const shortCode = user.username || user.id;
      const campaignUrl = campaign.websiteUrl || campaign.defaultReferralUrl;
      if (!campaignUrl) {
        return res.status(500).json({ error: 'Campaign URL not configured' });
      }
      
      const urlObj = new URL(campaignUrl);
      urlObj.searchParams.set('fpr', shortCode);
      const fullUrl = urlObj.toString();

      trackingLink = await prisma.trackingLink.create({
        data: {
          shortCode,
          fullUrl,
          userId: user.id,
          campaignId: campaign.id
        }
      });
    }

    // Create click tracking record
    await prisma.clickTracking.create({
      data: {
        trackingLinkId: trackingLink.id,
        userId: user.id,
        ipAddress: ipAddress || req.ip,
        userAgent: userAgent || req.get('user-agent'),
        referrerUrl: referrerUrl || req.get('referer')
      }
    });

    // Increment click count
    await prisma.trackingLink.update({
      where: { id: trackingLink.id },
      data: { clicks: { increment: 1 } }
    });

    res.json({
      success: true,
      promoter: {
        username: user.username,
        email: user.email
      },
      campaign: {
        id: campaign.id,
        name: campaign.name
      }
    });
  } catch (error) {
    console.error('Track click by ref error:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
};

// Get referral info from ?ref=username or ?fpr=code (for frontend to identify promoter)
export const getReferralInfo = async (req: Request, res: Response) => {
  try {
    const { ref, fpr } = req.query;
    
    // Accept both 'ref' and 'fpr' parameters
    const refCode = (ref || fpr) as string;

    if (!refCode || typeof refCode !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid ref/fpr parameter' });
    }

    // Find user by username or inviteCode
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: refCode },
          { inviteCode: refCode }
        ]
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Get active campaign
    const campaign = await prisma.campaign.findFirst({
      where: {
        isActive: true,
        visibleToPromoters: true
      },
      select: {
        id: true,
        name: true,
        description: true,
        commissionRate: true
      }
    });

    res.json({
      promoter: {
        id: user.id,
        username: user.username,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        email: user.email
      },
      campaign: campaign || null,
      ref: refCode
    });
  } catch (error) {
    console.error('Get referral info error:', error);
    res.status(500).json({ error: 'Failed to get referral info' });
  }
};
