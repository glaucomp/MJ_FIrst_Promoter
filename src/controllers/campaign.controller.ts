import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
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
      maxInvitesPerMonth,
      linkedCampaignId,
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
        maxInvitesPerMonth: maxInvitesPerMonth && parseInt(maxInvitesPerMonth) > 0 ? parseInt(maxInvitesPerMonth) : null,
        linkedCampaignId: linkedCampaignId || null,
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

// Resolves the set of campaigns an account manager is allowed to invite
// promoters under. AMs always operate on a *hidden* membership campaign
// (created when an admin invited them), but the actual public campaign
// they promote on is whatever is configured as `linkedCampaignId` on that
// membership row. The picker therefore surfaces those linked public
// campaigns only — never the hidden membership campaign itself, and never
// unrelated public campaigns.
//
// As a self-heal, if a membership campaign has no `linkedCampaignId` and
// the system has exactly one obvious active public campaign, we back-fill
// the link so AMs created before this guard existed (or via the admin UI
// without an explicit link) immediately have somewhere to invite onto.
// With zero or several public campaigns the choice is ambiguous and we
// leave the link unset; the FE renders an empty-state pointing the admin
// at the Campaigns page to configure the link explicitly.
const getAccountManagerVisibleCampaigns = async (amUserId: string) => {
  const amMemberships = await prisma.referral.findMany({
    where: {
      referredUserId: amUserId,
      status: 'ACTIVE',
      campaign: {
        visibleToPromoters: false,
      },
      referrer: {
        role: UserRole.ADMIN,
      },
    },
    select: {
      campaign: {
        select: { id: true, linkedCampaignId: true },
      },
    },
  });

  await backfillUnlinkedMembershipCampaigns(amMemberships);

  const linkedCampaignIds = Array.from(
    new Set(
      amMemberships
        .map((r) => r.campaign?.linkedCampaignId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (linkedCampaignIds.length === 0) {
    return [];
  }

  return prisma.campaign.findMany({
    where: {
      isActive: true,
      visibleToPromoters: true,
      id: { in: linkedCampaignIds },
    },
    include: {
      linkedCampaign: {
        select: { id: true, name: true, visibleToPromoters: true },
      },
      _count: {
        select: { referrals: true, commissions: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

// Mutates `amMemberships` in-place so the caller can read the back-filled
// `linkedCampaignId` without re-querying. Defense-in-depth: the
// `updateMany` re-asserts `visibleToPromoters: false` and
// `linkedCampaignId: null` on its own where clause so a future refactor
// of the upstream query can never cause us to overwrite a public
// campaign's link as a side-effect of this read path.
type AmMembershipRow = {
  campaign: { id: string; linkedCampaignId: string | null } | null;
};
const backfillUnlinkedMembershipCampaigns = async (
  amMemberships: AmMembershipRow[],
): Promise<void> => {
  const unlinkedMembershipCampaignIds = Array.from(
    new Set(
      amMemberships.flatMap((r) =>
        r.campaign && !r.campaign.linkedCampaignId ? [r.campaign.id] : [],
      ),
    ),
  );
  if (unlinkedMembershipCampaignIds.length === 0) return;

  const publicCampaigns = await prisma.campaign.findMany({
    where: { isActive: true, visibleToPromoters: true },
    select: { id: true },
    take: 2,
  });
  if (publicCampaigns.length !== 1) return;

  const fallbackPublicId = publicCampaigns[0].id;
  const updated = await prisma.campaign.updateMany({
    where: {
      id: { in: unlinkedMembershipCampaignIds },
      visibleToPromoters: false,
      linkedCampaignId: null,
    },
    data: { linkedCampaignId: fallbackPublicId },
  });
  if (updated.count === 0) return;

  for (const m of amMemberships) {
    if (m.campaign && !m.campaign.linkedCampaignId) {
      m.campaign.linkedCampaignId = fallbackPublicId;
    }
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
          linkedCampaign: {
            select: { id: true, name: true, visibleToPromoters: true }
          },
          _count: {
            select: { referrals: true, commissions: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (user.userType === UserType.ACCOUNT_MANAGER) {
      campaigns = await getAccountManagerVisibleCampaigns(user.id);
    } else {
      // Promoters / team managers only see campaigns flagged
      // visibleToPromoters: true.
      campaigns = await prisma.campaign.findMany({
        where: {
          isActive: true,
          visibleToPromoters: true,
        },
        include: {
          linkedCampaign: {
            select: { id: true, name: true, visibleToPromoters: true }
          },
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
        linkedCampaign: {
          select: { id: true, name: true, visibleToPromoters: true }
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
      maxInvitesPerMonth,
      linkedCampaignId,
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
        ...(maxInvitesPerMonth !== undefined && { maxInvitesPerMonth: maxInvitesPerMonth && parseInt(maxInvitesPerMonth) > 0 ? parseInt(maxInvitesPerMonth) : null }),
        ...(linkedCampaignId !== undefined && { linkedCampaignId: linkedCampaignId || null }),
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
