import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiKeyRequest } from '../middleware/apiKey.middleware';

const prisma = new PrismaClient();

// POST /api/v2/track/sale
export const trackSale = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { email, uid, amount, event_id, ref_id, tid, plan, username } = req.body;

    // Validation
    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    if (!email && !uid) {
      return res.status(400).json({ error: 'email or uid is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    // Check if event already tracked (prevent duplicates)
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        OR: [
          { metadata: event_id },
          { email: email || '' }
        ]
      }
    });

    if (existingCustomer && existingCustomer.metadata === event_id) {
      return res.status(200).json({
        success: true,
        message: 'Sale already tracked',
        event_id,
        duplicate: true
      });
    }

    // Find referral by ref_id, username, tid, or email/uid
    let referral;

    // Try by ref_id first
    if (ref_id) {
      referral = await prisma.referral.findFirst({
        where: {
          inviteCode: ref_id,
          status: 'ACTIVE'
        },
        include: {
          campaign: true,
          referrer: true,
          parentReferral: {
            include: {
              referrer: true,
              campaign: true
            }
          }
        }
      });
    }

    // Try by username if ref_id didn't work
    if (!referral && username) {
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          referralsReceived: {
            where: { status: 'ACTIVE' },
            include: {
              campaign: true,
              referrer: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (user && user.referralsReceived.length > 0) {
        const userReferral = user.referralsReceived[0];
        
        // Create a structure where the USER (Sofia) is the primary earner
        referral = {
          id: userReferral.id,
          campaign: userReferral.campaign,
          referrer: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
          },
          parentReferral: {
            id: userReferral.id,
            referrer: userReferral.referrer,
            referrerId: userReferral.referrerId,
            campaign: userReferral.campaign
          }
        } as any;
      }
    }

    if (!referral && (email || uid)) {
      // Try to find by referred user email/uid
      referral = await prisma.referral.findFirst({
        where: {
          status: 'ACTIVE',
          referredUser: email
            ? { email }
            : uid
            ? { id: uid }
            : undefined
        },
        include: {
          campaign: true,
          referrer: true,
          parentReferral: {
            include: {
              referrer: true,
              campaign: true
            }
          }
        }
      });
    }

    if (!referral) {
      return res.status(404).json({
        error: 'No active referral found',
        ref_id,
        username,
        email,
        uid
      });
    }

    // Calculate revenue (amount is in cents, convert to dollars)
    const revenue = amount / 100;
    const campaign = referral.campaign;

    // Create Customer record
    const customer = await prisma.customer.create({
      data: {
        email: email || `uid-${uid}@temp.com`,
        name: email ? email.split('@')[0] : `User ${uid}`,
        revenue,
        subscriptionType: plan || 'one-time',
        status: 'active',
        campaignId: campaign.id,
        referralId: referral.id,
        metadata: event_id
      }
    });

    // Create Level 1 Commission
    const level1Amount = (revenue * campaign.commissionRate) / 100;

    const commission1 = await prisma.commission.create({
      data: {
        amount: level1Amount,
        percentage: campaign.commissionRate,
        status: 'unpaid',
        description: `Direct customer sale ($${revenue.toFixed(2)})`,
        userId: referral.referrerId,
        campaignId: campaign.id,
        referralId: referral.id,
        customerId: customer.id
      }
    });

    console.log(`✅ Commission created: $${level1Amount.toFixed(2)} for ${referral.referrer.email}`);

    let commission2 = null;

    // Create Level 2 Commission (if exists)
    if (referral.parentReferral && campaign.secondaryRate && campaign.secondaryRate > 0) {
      const level2Amount = (revenue * campaign.secondaryRate) / 100;

      commission2 = await prisma.commission.create({
        data: {
          amount: level2Amount,
          percentage: campaign.secondaryRate,
          status: 'unpaid',
          description: `From ${referral.referrer.firstName}'s sale ($${revenue.toFixed(2)})`,
          userId: referral.parentReferral.referrerId,
          campaignId: campaign.id,
          referralId: referral.parentReferral.id,
          customerId: customer.id
        }
      });

      console.log(`✅ Level 2 Commission: $${level2Amount.toFixed(2)} for ${referral.parentReferral.referrer.email}`);
    }

    res.status(200).json({
      success: true,
      event_id,
      customer_id: customer.id,
      commissions: {
        level1: {
          id: commission1.id,
          amount: level1Amount,
          promoter: referral.referrer.email
        },
        ...(commission2 && {
          level2: {
            id: commission2.id,
            amount: (revenue * (campaign.secondaryRate || 0)) / 100,
            promoter: referral.parentReferral?.referrer.email
          }
        })
      }
    });
  } catch (error) {
    console.error('Track sale error:', error);
    res.status(500).json({ error: 'Failed to track sale' });
  }
};

// POST /api/v2/track/signup
export const trackSignup = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { email, uid, tid } = req.body;

    if (!tid) {
      return res.status(400).json({ error: 'tid (tracking ID) is required' });
    }

    if (!email && !uid) {
      return res.status(400).json({ error: 'email or uid is required' });
    }

    // Find referral by tracking ID
    const referral = await prisma.referral.findFirst({
      where: {
        inviteCode: tid
      }
    });

    if (!referral) {
      return res.status(404).json({ error: 'Tracking ID not found' });
    }

    // Update referral with user info (if not already set)
    if (!referral.referredUserId && uid) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          referredUserId: uid,
          status: 'ACTIVE',
          acceptedAt: new Date()
        }
      });
    }

    res.json({
      success: true,
      tid,
      referral_id: referral.id
    });
  } catch (error) {
    console.error('Track signup error:', error);
    res.status(500).json({ error: 'Failed to track signup' });
  }
};

// POST /api/v2/track/refund
export const trackRefund = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { event_id, amount, email, uid } = req.body;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    // Find the original customer by event_id
    const customer = await prisma.customer.findFirst({
      where: {
        metadata: event_id
      },
      include: {
        referral: {
          include: {
            campaign: true,
            referrer: true,
            parentReferral: {
              include: {
                referrer: true
              }
            }
          }
        }
      }
    });

    if (!customer || !customer.referral) {
      return res.status(404).json({ error: 'Original sale not found' });
    }

    const refundRevenue = amount;
    const campaign = customer.referral.campaign;

    // Create negative commission for Level 1
    const level1RefundAmount = -(refundRevenue * campaign.commissionRate) / 100;

    await prisma.commission.create({
      data: {
        amount: level1RefundAmount,
        percentage: campaign.commissionRate,
        status: 'paid', // Refunds are processed immediately
        userId: customer.referral.referrerId,
        campaignId: campaign.id,
        referralId: customer.referral.id
      }
    });

    // Create negative commission for Level 2 (if exists)
    if (customer.referral.parentReferral && campaign.secondaryRate && campaign.secondaryRate > 0) {
      const level2RefundAmount = -(refundRevenue * campaign.secondaryRate) / 100;

      await prisma.commission.create({
        data: {
          amount: level2RefundAmount,
          percentage: campaign.secondaryRate,
          status: 'paid',
          userId: customer.referral.parentReferral.referrerId,
          campaignId: campaign.id,
          referralId: customer.referral.parentReferral.id
        }
      });
    }

    // Update customer status
    await prisma.customer.update({
      where: { id: customer.id },
      data: { status: 'cancelled' }
    });

    res.json({
      success: true,
      event_id,
      refund_amount: refundRevenue,
      commissions_adjusted: true
    });
  } catch (error) {
    console.error('Track refund error:', error);
    res.status(500).json({ error: 'Failed to track refund' });
  }
};
