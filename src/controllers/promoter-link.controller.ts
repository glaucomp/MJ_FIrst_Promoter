import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

// GET /api/promoter/my-link
// Returns the promoter's permanent referral link (username-based)
export const getMyPromoterLink = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get full user with username and inviteCode
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        inviteCode: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the first active campaign (or you can let them choose)
    const campaign = await prisma.campaign.findFirst({
      where: {
        isActive: true,
        visibleToPromoters: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'No active campaigns available' });
    }

    // Use username as the ref code
    const refCode = user.username || user.inviteCode || user.id;
    
    // Build the referral URL
    const campaignUrl = campaign.websiteUrl || campaign.defaultReferralUrl;
    if (!campaignUrl) {
      return res.status(404).json({ error: 'Campaign URL not configured' });
    }
    
    const url = new URL(campaignUrl);
    url.searchParams.set('fpr', refCode);
    
    const referralLink = url.toString();

    res.json({
      referralLink,
      refCode,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        commissionRate: campaign.commissionRate
      },
      user: {
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Get promoter link error:', error);
    res.status(500).json({ error: 'Failed to get referral link' });
  }
};
