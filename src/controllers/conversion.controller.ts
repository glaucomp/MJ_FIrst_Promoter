import { Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { ApiKeyRequest } from '../middleware/apiKey.middleware';

const prisma = new PrismaClient();

const hiddenLinkedCampaignClause = (publicSaleCampaignId: string) => ({
  visibleToPromoters: false,
  isActive: true,
  linkedCampaignId: publicSaleCampaignId,
});

/** Resolves the referral row whose hidden `secondaryRate` pays the public upline (AM direct slice). */
async function resolveAmMembershipReferralForSale(args: {
  publicUplineUserId: string | null;
  sellerUserId: string;
  publicSaleCampaignId: string;
}) {
  const { publicUplineUserId, sellerUserId, publicSaleCampaignId } = args;
  if (publicUplineUserId == null) return null;

  const select = {
    id: true,
    campaign: { select: { id: true, secondaryRate: true } },
  } as const;
  const hidden = hiddenLinkedCampaignClause(publicSaleCampaignId);

  // 1) AM enrolled the seller on the hidden campaign linked to this public program (seed + some prod rows).
  const amInvitedSeller = await prisma.referral.findFirst({
    where: {
      referrerId: publicUplineUserId,
      referredUserId: sellerUserId,
      status: 'ACTIVE',
      campaign: hidden,
    },
    orderBy: { acceptedAt: 'desc' },
    select,
  });
  if (amInvitedSeller) return amInvitedSeller;

  // 2) Admin enrolled the upline as an account manager (invitee row only — not influencer→friend hidden chains).
  return prisma.referral.findFirst({
    where: {
      referredUserId: publicUplineUserId,
      status: 'ACTIVE',
      referrer: { role: UserRole.ADMIN },
      campaign: hidden,
    },
    orderBy: { acceptedAt: 'desc' },
    select,
  });
}

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
              campaign: true,
              parentReferral: {
                include: {
                  referrer: true,
                  campaign: true
                }
              }
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
            select: {
              id: true,
              referrerId: true,
              campaign: true,
              referrer: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true
                }
              },
              parentReferral: {
                select: {
                  id: true,
                  referrerId: true,
                  campaign: true,
                  referrer: {
                    select: {
                      id: true,
                      email: true,
                      firstName: true,
                      lastName: true
                    }
                  },
                  parentReferral: {
                    select: {
                      id: true,
                      referrerId: true,
                      campaign: true,
                      referrer: {
                        select: {
                          id: true,
                          email: true,
                          firstName: true,
                          lastName: true
                        }
                      }
                    }
                  }
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
        
        // Create a structure where the USER is the primary earner
        referral = {
          id: userReferral.id,
          campaign: userReferral.campaign,
          referrerId: user.id, // Critical: userId for commission creation
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
            campaign: userReferral.campaign,
            parentReferral: userReferral.parentReferral ?? null
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
              campaign: true,
              parentReferral: {
                include: {
                  referrer: true,
                  campaign: true
                }
              }
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

    // Read chatter group + account manager data before the write transaction
    // (read-only, no connection held). We need `accountManagerId` here so we
    // can pay the AM regardless of where they sit in the parentReferral chain.
    const promoterWithGroup = await prisma.user.findUnique({
      where: { id: referral.referrerId },
      select: {
        chatterGroupId: true,
        accountManagerId: true,
        chatterGroup: {
          select: {
            id: true,
            commissionPercentage: true,
            members: { select: { chatterId: true } },
          },
        },
      },
    });

    const sellingPromoterAmId = promoterWithGroup?.accountManagerId ?? null;
    const parentRef = referral.parentReferral ?? null;
    const parentUplineUserId = parentRef?.referrerId ?? null;

    const inviterOnCampaign = await prisma.referral.findFirst({
      where: {
        referredUserId: referral.referrerId,
        campaignId: campaign.id,
        status: 'ACTIVE',
      },
      orderBy: { acceptedAt: 'desc' },
      select: { id: true, referrerId: true },
    });
    const inviterReferrerId = inviterOnCampaign?.referrerId ?? null;

    // Who sits "above" the seller on this public campaign: tracking parent
    // first, else the person who invited the seller onto this campaign.
    // - AM → influencer: usually inviter = AM (parent often null) → AM path.
    // - Influencer → friend: parent or inviter = influencer → public referral %.
    const publicUplineUserId = parentUplineUserId ?? inviterReferrerId ?? null;

    // Hidden "Account manager campaign" slice: only users with an ACTIVE
    // invitee row on a hidden campaign linked to this public sale campaign.
    // That is true for account managers enrolled by admin, not for normal
    // influencers who referred a friend (they use public referral % below).
    const membershipSubjectUserId = publicUplineUserId;

    // Hidden AM rate: either AM→seller on the linked hidden campaign, or
    // admin→AM invitee membership (see `resolveAmMembershipReferralForSale`).
    const amMembershipReferral = await resolveAmMembershipReferralForSale({
      publicUplineUserId: membershipSubjectUserId,
      sellerUserId: referral.referrerId,
      publicSaleCampaignId: campaign.id,
    });

    // Pre-compute all amounts before entering the transaction
    const level1Amount = (revenue * campaign.commissionRate) / 100;
    const group =
      promoterWithGroup?.chatterGroup &&
      promoterWithGroup.chatterGroup.members.length > 0
        ? promoterWithGroup.chatterGroup
        : null;
    const perChatter = group
      ? (revenue * group.commissionPercentage) / 100 / group.members.length
      : 0;

    // Account-manager-aware upline payout.
    //
    //   A) Seller was brought in by an account manager (hidden membership row
    //      linked to this public campaign) → pay hidden secondaryRate to that
    //      AM, not the public "referral commission %".
    //
    //   B) Seller was referred by another influencer / friend on this public
    //      campaign → pay public campaign secondaryRate (referral tier) to the
    //      direct upline (parent in tracking chain, or inviter row if parent
    //      missing).
    //
    //   C) Off-chain AM (`User.accountManagerId`) gets `recurringRate` when
    //      (A) did not apply.

    // (1) Hidden AM membership rate (see A above).
    let amDirectAmount = 0;
    let amDirectRate = 0;
    let amDirectCampaignId: string | null = null;
    let amDirectReferralId: string | null = null;
    if (amMembershipReferral) {
      const rate = amMembershipReferral.campaign?.secondaryRate ?? 0;
      if (rate > 0) {
        amDirectRate = rate;
        amDirectAmount = (revenue * rate) / 100;
        amDirectCampaignId = amMembershipReferral.campaign.id;
        amDirectReferralId = amMembershipReferral.id;
      }
    }

    // If the upline has no usable hidden-campaign rate, fall back to other
    // paths (public L2 and/or recurring AM %).
    const amDirectPaid = amDirectAmount > 0;
    const directAmRecipientUserId = amDirectPaid
      ? membershipSubjectUserId
      : null;

    const skipPublicReferralSliceToAssignedAm =
      !!publicUplineUserId &&
      !!sellingPromoterAmId &&
      publicUplineUserId === sellingPromoterAmId;

    // (2) Public "referral commission %" to upline (see B above).
    const level2Amount =
      !amDirectPaid &&
      !skipPublicReferralSliceToAssignedAm &&
      !!publicUplineUserId &&
      (campaign.secondaryRate ?? 0) > 0
        ? (revenue * campaign.secondaryRate!) / 100
        : 0;

    let level2ReferralIdForCommission: string | null = null;
    if (level2Amount > 0 && publicUplineUserId) {
      if (parentRef?.referrerId === publicUplineUserId) {
        level2ReferralIdForCommission = parentRef.id;
      } else {
        const l2Row = await prisma.referral.findFirst({
          where: {
            referrerId: publicUplineUserId,
            referredUserId: referral.referrerId,
            campaignId: campaign.id,
            status: 'ACTIVE',
          },
          orderBy: { acceptedAt: 'desc' },
          select: { id: true },
        });
        level2ReferralIdForCommission = l2Row?.id ?? inviterOnCampaign?.id ?? null;
      }
    }

    // (3) AM-not-direct payout — recurring % on public campaign (see C above).
    let amIndirectAmount = 0;
    let amIndirectRate = 0;
    let amIndirectUserId: string | null = null;
    let amIndirectReferralId: string | null = null;
    if (
      !amDirectPaid &&
      sellingPromoterAmId &&
      (campaign.recurringRate ?? 0) > 0
    ) {
      amIndirectRate = campaign.recurringRate!;
      amIndirectAmount = (revenue * amIndirectRate) / 100;
      amIndirectUserId = sellingPromoterAmId;
      // Best-effort: pin the AM commission to the closest known referral row
      // (the direct upline's referral if it exists, otherwise the sale row).
      amIndirectReferralId = parentRef?.id ?? referral.id;
    }

    // Single atomic transaction — all writes succeed or all roll back
    const {
      customer,
      transaction,
      commission1,
      chatterCommissions,
      commission2,
      commission3,
    } = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            email: email || `uid-${uid}@temp.com`,
            name: email ? email.split('@')[0] : `User ${uid}`,
            revenue,
            subscriptionType: plan || 'one-time',
            status: 'active',
            campaignId: campaign.id,
            referralId: referral.id,
            metadata: event_id,
          },
        });

        const transaction = await tx.transaction.create({
          data: {
            eventId: event_id,
            type: 'sale',
            saleAmount: revenue,
            status: 'completed',
            plan: plan || null,
            customerId: customer.id,
            campaignId: campaign.id,
            referralId: referral.id,
          },
        });

        const commission1 = await tx.commission.create({
          data: {
            amount: level1Amount,
            percentage: campaign.commissionRate,
            saleAmount: revenue,
            status: 'unpaid',
            description: `Direct customer sale ($${revenue.toFixed(2)})`,
            userId: referral.referrerId,
            campaignId: campaign.id,
            referralId: referral.id,
            customerId: customer.id,
            transactionId: transaction.id,
          },
        });

        // Chatter commissions — create sequentially inside the interactive transaction
        const chatterCommissions: { id: string; chatterId: string; amount: number }[] = [];
        if (group) {
          for (const member of group.members) {
            const cc = await tx.commission.create({
              data: {
                amount: perChatter,
                percentage: group.commissionPercentage / group.members.length,
                saleAmount: revenue,
                status: 'unpaid',
                type: 'chatter',
                description: `Chatter commission from ${referral.referrer.firstName || referral.referrer.email}'s sale ($${revenue.toFixed(2)})`,
                userId: member.chatterId,
                campaignId: campaign.id,
                referralId: referral.id,
                customerId: customer.id,
                transactionId: transaction.id,
              },
            });

            chatterCommissions.push({
              id: cc.id,
              chatterId: member.chatterId,
              amount: perChatter,
            });
          }
        }

        let commission2 = null;
        let commission3 = null;

        // (1) AM is the direct upline → pay AM using the AM Campaign rate.
        //     This *replaces* the regular L2 upline payout (the AM is the
        //     upline) and there is no separate Acc-Manager-% payout.
        if (
          amDirectAmount > 0 &&
          directAmRecipientUserId &&
          amDirectCampaignId &&
          amDirectReferralId
        ) {
          commission2 = await tx.commission.create({
            data: {
              amount: amDirectAmount,
              percentage: amDirectRate,
              saleAmount: revenue,
              status: 'unpaid',
              description: `Account manager (direct upline) from ${referral.referrer.firstName}'s sale ($${revenue.toFixed(2)})`,
              userId: directAmRecipientUserId,
              campaignId: amDirectCampaignId,
              referralId: amDirectReferralId,
              customerId: customer.id,
              transactionId: transaction.id,
            },
          });
        }

        // (2) Public referral upline (influencer → friend path, or multi-level).
        if (
          level2Amount > 0 &&
          publicUplineUserId &&
          level2ReferralIdForCommission
        ) {
          commission2 = await tx.commission.create({
            data: {
              amount: level2Amount,
              percentage: campaign.secondaryRate!,
              saleAmount: revenue,
              status: 'unpaid',
              description: `T2 upline from ${referral.referrer.firstName}'s sale ($${revenue.toFixed(2)})`,
              userId: publicUplineUserId,
              campaignId: campaign.id,
              referralId: level2ReferralIdForCommission,
              customerId: customer.id,
              transactionId: transaction.id,
            },
          });
        }

        // (3) Off-chain Account Manager — paid whenever the AM is not the
        //     direct upline. Identified via `User.accountManagerId`, so it
        //     fires no matter how deep the parent chain goes.
        if (amIndirectAmount > 0 && amIndirectUserId && amIndirectReferralId) {
          commission3 = await tx.commission.create({
            data: {
              amount: amIndirectAmount,
              percentage: amIndirectRate,
              saleAmount: revenue,
              status: 'unpaid',
              description: `Account manager from ${referral.referrer.firstName}'s sale ($${revenue.toFixed(2)})`,
              userId: amIndirectUserId,
              campaignId: campaign.id,
              referralId: amIndirectReferralId,
              customerId: customer.id,
              transactionId: transaction.id,
            },
          });
        }

        return { customer, transaction, commission1, chatterCommissions, commission2, commission3 };
      });

    let level2Email: string | null | undefined = parentRef?.referrer.email;
    if (!level2Email && amDirectAmount > 0 && membershipSubjectUserId) {
      const u = await prisma.user.findUnique({
        where: { id: membershipSubjectUserId },
        select: { email: true },
      });
      level2Email = u?.email ?? undefined;
    }
    if (!level2Email && level2Amount > 0 && publicUplineUserId) {
      const u = await prisma.user.findUnique({
        where: { id: publicUplineUserId },
        select: { email: true },
      });
      level2Email = u?.email ?? undefined;
    }

    console.log(`✅ Commission created: $${level1Amount.toFixed(2)} for ${referral.referrer.email}`);
    if (group) {
      console.log(`✅ Chatter commissions: $${perChatter.toFixed(2)} × ${group.members.length} chatters from group ${group.id}`);
    }
    if (amDirectAmount > 0) {
      console.log(
        `✅ AM (direct upline) Commission: $${amDirectAmount.toFixed(2)} (${amDirectRate}%) for user ${membershipSubjectUserId} (${level2Email ?? "email n/a"})`,
      );
    } else if (level2Amount > 0) {
      console.log(
        `✅ T2 Upline Commission: $${level2Amount.toFixed(2)} for public upline ${publicUplineUserId} (${level2Email ?? "email n/a"})`,
      );
    }
    if (amIndirectAmount > 0) {
      console.log(
        `✅ AM (off-chain) Commission: $${amIndirectAmount.toFixed(2)} (${amIndirectRate}%) for AM ${amIndirectUserId}`,
      );
    }

    // Resolve a friendly upline label without re-querying. The L2 row now
    // belongs either to the AM (direct upline case) or to a regular
    // influencer upline; either way it's the parentReferral's referrer.
    const level2Amt = amDirectAmount > 0 ? amDirectAmount : level2Amount;

    res.status(200).json({
      success: true,
      event_id,
      transaction_id: transaction.id,
      customer_id: customer.id,
      sale_amount: revenue,
      commissions: {
        level1: {
          id: commission1.id,
          amount: level1Amount,
          promoter: referral.referrer.email
        },
        ...(commission2 && {
          level2: {
            id: commission2.id,
            amount: level2Amt,
            promoter: level2Email,
            kind: amDirectAmount > 0 ? 'account_manager_direct' : 'upline',
          }
        }),
        ...(commission3 && {
          level3: {
            id: commission3.id,
            amount: amIndirectAmount,
            promoterId: amIndirectUserId,
            kind: 'account_manager',
          }
        }),
        ...(chatterCommissions.length > 0 && {
          chatters: chatterCommissions,
        }),
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
                referrer: true,
                campaign: true,
                parentReferral: {
                  include: {
                    referrer: true,
                    campaign: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!customer || !customer.referral) {
      return res.status(404).json({ error: 'Original sale not found' });
    }

    const refundRevenue = amount / 100; // amount is in cents, convert to dollars
    const referral = customer.referral; // narrowed: null already excluded above
    const campaign = referral.campaign;

    // Read-only lookups before the write transaction
    const [originalTransaction, promoterWithGroupRefund] = await Promise.all([
      prisma.transaction.findFirst({ where: { customerId: customer.id, type: 'sale' } }),
      prisma.user.findUnique({
        where: { id: referral.referrerId },
        select: {
          accountManagerId: true,
          chatterGroup: {
            select: {
              id: true,
              commissionPercentage: true,
              members: { select: { chatterId: true } },
            },
          },
        },
      }),
    ]);

    // Pre-compute all refund amounts before entering the transaction.
    // Mirrors the AM-aware payout logic in trackSale: we reverse whichever
    // commissions would have been written for the original sale.
    const refundAmId = promoterWithGroupRefund?.accountManagerId ?? null;
    const refundParentRef = referral.parentReferral ?? null;
    const refundParentUplineUserId = refundParentRef?.referrerId ?? null;

    const inviterOnCampaignRefund = await prisma.referral.findFirst({
      where: {
        referredUserId: referral.referrerId,
        campaignId: campaign.id,
        status: 'ACTIVE',
      },
      orderBy: { acceptedAt: 'desc' },
      select: { id: true, referrerId: true },
    });
    const refundInviterReferrerId = inviterOnCampaignRefund?.referrerId ?? null;
    const refundPublicUplineUserId =
      refundParentUplineUserId ?? refundInviterReferrerId ?? null;

    const amMembershipReferralRefund = await resolveAmMembershipReferralForSale({
      publicUplineUserId: refundPublicUplineUserId,
      sellerUserId: referral.referrerId,
      publicSaleCampaignId: campaign.id,
    });

    const level1RefundAmount = -(refundRevenue * campaign.commissionRate) / 100;
    const refundGroup =
      promoterWithGroupRefund?.chatterGroup &&
      promoterWithGroupRefund.chatterGroup.members.length > 0
        ? promoterWithGroupRefund.chatterGroup
        : null;
    const perChatterRefund = refundGroup
      ? -(refundRevenue * refundGroup.commissionPercentage) / 100 / refundGroup.members.length
      : 0;

    let amDirectRefundAmount = 0;
    let amDirectRefundRate = 0;
    let amDirectRefundCampaignId: string | null = null;
    let amDirectRefundReferralId: string | null = null;
    if (amMembershipReferralRefund) {
      const rate = amMembershipReferralRefund.campaign?.secondaryRate ?? 0;
      if (rate > 0) {
        amDirectRefundRate = rate;
        amDirectRefundAmount = -(refundRevenue * rate) / 100;
        amDirectRefundCampaignId = amMembershipReferralRefund.campaign.id;
        amDirectRefundReferralId = amMembershipReferralRefund.id;
      }
    }

    const amDirectRefundPaid = amDirectRefundAmount !== 0;

    const refundSkipPublicReferralSliceToAssignedAm =
      !!refundPublicUplineUserId &&
      !!refundAmId &&
      refundPublicUplineUserId === refundAmId;

    const level2RefundAmount =
      !amDirectRefundPaid &&
      !refundSkipPublicReferralSliceToAssignedAm &&
      !!refundPublicUplineUserId &&
      (campaign.secondaryRate ?? 0) > 0
        ? -(refundRevenue * campaign.secondaryRate!) / 100
        : 0;

    let refundLevel2ReferralIdForCommission: string | null = null;
    if (level2RefundAmount !== 0 && refundPublicUplineUserId) {
      if (refundParentRef?.referrerId === refundPublicUplineUserId) {
        refundLevel2ReferralIdForCommission = refundParentRef.id;
      } else {
        const l2RowRefund = await prisma.referral.findFirst({
          where: {
            referrerId: refundPublicUplineUserId,
            referredUserId: referral.referrerId,
            campaignId: campaign.id,
            status: 'ACTIVE',
          },
          orderBy: { acceptedAt: 'desc' },
          select: { id: true },
        });
        refundLevel2ReferralIdForCommission = l2RowRefund?.id ?? inviterOnCampaignRefund?.id ?? null;
      }
    }

    let amIndirectRefundAmount = 0;
    let amIndirectRefundRate = 0;
    let amIndirectRefundUserId: string | null = null;
    let amIndirectRefundReferralId: string | null = null;
    if (
      !amDirectRefundPaid &&
      refundAmId &&
      (campaign.recurringRate ?? 0) > 0
    ) {
      amIndirectRefundRate = campaign.recurringRate!;
      amIndirectRefundAmount = -(refundRevenue * amIndirectRefundRate) / 100;
      amIndirectRefundUserId = refundAmId;
      amIndirectRefundReferralId = refundParentRef?.id ?? referral.id;
    }

    // Single atomic transaction — all writes succeed or all roll back
    const refundTransaction = await prisma.$transaction(async (tx) => {
      const refundTransaction = await tx.transaction.create({
        data: {
          eventId: `refund-${event_id}`,
          type: 'refund',
          saleAmount: refundRevenue,
          status: 'refunded',
          customerId: customer.id,
          campaignId: campaign.id,
          referralId: referral.id,
          originalTransactionId: originalTransaction?.id ?? null,
        },
      });

      await tx.commission.create({
        data: {
          amount: level1RefundAmount,
          percentage: campaign.commissionRate,
          saleAmount: refundRevenue,
          status: 'paid',
          description: `Refund ($${refundRevenue.toFixed(2)})`,
          userId: referral.referrerId,
          campaignId: campaign.id,
          referralId: referral.id,
          customerId: customer.id,
          transactionId: refundTransaction.id,
        },
      });

      // Negative chatter commissions — execute sequentially inside the same transaction
      if (refundGroup) {
        for (const member of refundGroup.members) {
          await tx.commission.create({
            data: {
              amount: perChatterRefund,
              percentage: refundGroup.commissionPercentage / refundGroup.members.length,
              saleAmount: refundRevenue,
              status: 'paid',
              type: 'chatter',
              description: `Chatter refund ($${refundRevenue.toFixed(2)})`,
              userId: member.chatterId,
              campaignId: campaign.id,
              referralId: referral.id,
              customerId: customer.id,
              transactionId: refundTransaction.id,
            },
          });
        }
      }

      // (1) AM-as-direct-upline reversal — replaces the regular L2 refund
      //     when the direct upline is the selling promoter's AM.
      if (
        amDirectRefundAmount !== 0 &&
        refundPublicUplineUserId &&
        amDirectRefundCampaignId &&
        amDirectRefundReferralId
      ) {
        await tx.commission.create({
          data: {
            amount: amDirectRefundAmount,
            percentage: amDirectRefundRate,
            saleAmount: refundRevenue,
            status: 'paid',
            description: `Account manager (direct upline) refund ($${refundRevenue.toFixed(2)})`,
            userId: refundPublicUplineUserId,
            campaignId: amDirectRefundCampaignId,
            referralId: amDirectRefundReferralId,
            customerId: customer.id,
            transactionId: refundTransaction.id,
          },
        });
      }

      // (2) Public referral upline refund
      if (
        level2RefundAmount !== 0 &&
        refundPublicUplineUserId &&
        refundLevel2ReferralIdForCommission
      ) {
        await tx.commission.create({
          data: {
            amount: level2RefundAmount,
            percentage: campaign.secondaryRate!,
            saleAmount: refundRevenue,
            status: 'paid',
            description: `T2 refund ($${refundRevenue.toFixed(2)})`,
            userId: refundPublicUplineUserId,
            campaignId: campaign.id,
            referralId: refundLevel2ReferralIdForCommission,
            customerId: customer.id,
            transactionId: refundTransaction.id,
          },
        });
      }

      // (3) Off-chain Account Manager reversal — paid whenever the AM is
      //     not the direct upline.
      if (
        amIndirectRefundAmount !== 0 &&
        amIndirectRefundUserId &&
        amIndirectRefundReferralId
      ) {
        await tx.commission.create({
          data: {
            amount: amIndirectRefundAmount,
            percentage: amIndirectRefundRate,
            saleAmount: refundRevenue,
            status: 'paid',
            description: `Account manager refund ($${refundRevenue.toFixed(2)})`,
            userId: amIndirectRefundUserId,
            campaignId: campaign.id,
            referralId: amIndirectRefundReferralId,
            customerId: customer.id,
            transactionId: refundTransaction.id,
          },
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: { status: 'cancelled' },
      });

      if (originalTransaction) {
        await tx.transaction.update({
          where: { id: originalTransaction.id },
          data: { status: 'refunded' },
        });
      }

      return refundTransaction;
    });

    res.json({
      success: true,
      event_id,
      transaction_id: refundTransaction.id,
      refund_amount: refundRevenue,
      commissions_adjusted: true
    });
  } catch (error) {
    console.error('Track refund error:', error);
    res.status(500).json({ error: 'Failed to track refund' });
  }
};
