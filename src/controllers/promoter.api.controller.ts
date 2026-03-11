import { Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { ApiKeyRequest } from '../middleware/apiKey.middleware';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

// POST /api/v1/promoters/create
export const createPromoter = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { 
      email, 
      ref_id, 
      first_name, 
      last_name, 
      paypal_email, 
      auth_token, 
      temp_password,
      parent_promoter_id,  // Parent's ref_id (for multi-level tracking)
      cust_id              // Custom customer ID from your system
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Check if promoter already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(200).json({
        id: existing.id,
        email: existing.email,
        ref_id: existing.inviteCode,
        cust_id: cust_id || existing.id,
        message: 'Promoter already exists'
      });
    }

    // Generate unique invite code
    const inviteCode = ref_id || nanoid(10);

    // Create password (use temp_password if provided, otherwise generate)
    const password = temp_password || Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create promoter
    const promoter = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: first_name || email.split('@')[0],
        lastName: last_name || '',
        role: UserRole.PROMOTER,
        inviteCode,
        isActive: true
      }
    });

    console.log(`✅ Promoter created via API: ${email} (${inviteCode})`);

    // If parent_promoter_id is provided, create the referral relationship
    if (parent_promoter_id) {
      // Find parent promoter by their ref_id (inviteCode)
      const parentPromoter = await prisma.user.findFirst({
        where: {
          inviteCode: parent_promoter_id,
          role: UserRole.PROMOTER
        }
      });

      if (parentPromoter) {
        // Find an active campaign to link this referral
        // Prioritize campaigns with auto-approve enabled
        const campaign = await prisma.campaign.findFirst({
          where: { 
            isActive: true,
            visibleToPromoters: true
          },
          orderBy: { createdAt: 'desc' }
        });

        if (campaign) {
          // Create the referral relationship
          const referral = await prisma.referral.create({
            data: {
              referrerId: parentPromoter.id,
              referredUserId: promoter.id,
              campaignId: campaign.id,
              inviteCode: nanoid(10),
              status: campaign.autoApprove ? 'ACTIVE' : 'PENDING',
              acceptedAt: campaign.autoApprove ? new Date() : null
            }
          });

          console.log(`✅ Referral created: ${parentPromoter.email} -> ${promoter.email} (${referral.inviteCode})`);
        }
      } else {
        console.log(`⚠️  Parent promoter not found: ${parent_promoter_id}`);
      }
    }

    const response: any = {
      id: promoter.id,
      email: promoter.email,
      ref_id: inviteCode,
      cust_id: cust_id || promoter.id,
      first_name: first_name || promoter.firstName || '',
      last_name: last_name || promoter.lastName || '',
      created_at: promoter.createdAt
    };
    
    // Include parent_promoter_id if provided
    if (parent_promoter_id) {
      response.parent_promoter_id = parent_promoter_id;
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error('Create promoter error:', error);
    res.status(500).json({ error: 'Failed to create promoter' });
  }
};

// GET /api/v2/company/promoters/:id
export const getPromoterById = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { id } = req.params;

    const promoter = await prisma.user.findFirst({
      where: {
        id,
        role: UserRole.PROMOTER
      },
      include: {
        referralsMade: {
          include: {
            campaign: true,
            referredUser: true
          }
        },
        commissions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!promoter) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    // Calculate stats
    const totalEarnings = promoter.commissions.reduce((sum, c) => sum + c.amount, 0);
    const totalReferrals = promoter.referralsMade.length;
    const activeReferrals = promoter.referralsMade.filter(r => r.status === 'ACTIVE').length;

    res.json({
      id: promoter.id,
      email: promoter.email,
      ref_id: promoter.inviteCode || '',
      name: promoter.firstName && promoter.lastName ? `${promoter.firstName} ${promoter.lastName}` : promoter.email.split('@')[0],
      status: promoter.isActive ? 'active' : 'inactive',
      created_at: promoter.createdAt,
      stats: {
        total_referrals: totalReferrals,
        active_referrals: activeReferrals,
        total_earnings: totalEarnings,
        pending_commissions: promoter.commissions.filter(c => c.status === 'unpaid').length
      },
      referrals: promoter.referralsMade.map(r => ({
        id: r.id,
        campaign: r.campaign.name,
        status: r.status,
        referred_email: r.referredUser?.email || 'N/A',
        created_at: r.createdAt
      }))
    });
  } catch (error) {
    console.error('Get promoter error:', error);
    res.status(500).json({ error: 'Failed to get promoter' });
  }
};

// GET /api/v2/company/promoters?search=ref_token
export const searchPromoters = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { search } = req.query;

    if (!search) {
      return res.status(400).json({ error: 'search parameter required' });
    }

    // Search by ref_id (inviteCode)
    const promoters = await prisma.user.findMany({
      where: {
        role: UserRole.PROMOTER,
        inviteCode: search as string
      },
      include: {
        referralsMade: true,
        commissions: true
      }
    });

    if (promoters.length === 0) {
      return res.status(404).json({ error: 'Promoter not found' });
    }

    const promoter = promoters[0];

    // Calculate stats
    const totalEarnings = promoter.commissions.reduce((sum, c) => sum + c.amount, 0);
    const totalReferrals = promoter.referralsMade.length;

    res.json({
      id: promoter.id,
      email: promoter.email,
      ref_id: promoter.inviteCode || '',
      name: promoter.firstName && promoter.lastName ? `${promoter.firstName} ${promoter.lastName}` : promoter.email.split('@')[0],
      status: promoter.isActive ? 'active' : 'inactive',
      stats: {
        total_referrals: totalReferrals,
        total_earnings: totalEarnings
      }
    });
  } catch (error) {
    console.error('Search promoters error:', error);
    res.status(500).json({ error: 'Failed to search promoters' });
  }
};
