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
          accountManagerId: true,
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
    const directUplineIsAM =
      !!parentRef &&
      !!sellingPromoterAmId &&
      parentRef.referrerId === sellingPromoterAmId;

    // When the direct upline is the AM, we pay them using THEIR own
    // membership campaign's `secondaryRate` (the "UPLINE %" on the hidden
    // Account-Manager-Campaign card the admin invited them into). We can't
    // rely on `referral.parentReferral.parentReferral.campaign` because the
    // AM's own R1 invite has `parentReferralId = null` (see
    // `referral.controller.ts:487-504` — only PROMOTER inviters get a parent
    // set), so we look it up directly: the most recent active membership
    // referral where the AM was the invitee, whose campaign is the hidden
    // one linked to the sale's public campaign.
    const amMembershipReferral =
      directUplineIsAM && sellingPromoterAmId
        ? await prisma.referral.findFirst({
            where: {
              referredUserId: sellingPromoterAmId,
              status: 'ACTIVE',
              referrer: {
                role: 'ADMIN',
              },
              campaign: {
                visibleToPromoters: false,
                isActive: true,
                linkedCampaignId: campaign.id,
              },
            },
            orderBy: { acceptedAt: 'desc' },
            select: {
              id: true,
              campaign: {
                select: { id: true, secondaryRate: true },
              },
            },
          })
        : null;

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
    // The selling promoter's AM is identified by `User.accountManagerId`, NOT
    // by walking the parent-referral chain. There are two payout shapes:
    //
    //   1) AM is the DIRECT upline of the selling promoter (i.e. the AM is
    //      the inviter on `parentReferral`). In that case we pay the AM using
    //      the AM's *own* membership campaign's `secondaryRate` (looked up
    //      via `amMembershipReferral` above). No additional Acc-Manager-%
    //      payout is made because the AM is already covered here.
    //
    //   2) AM is NOT the direct upline (the chain is influencer → influencer
    //      → ... → friend, with the AM somewhere off-chain). In that case
    //      the direct upline gets the sale-campaign's `secondaryRate` (the
    //      "Upline %" slot, e.g. 5%) and the AM separately gets the
    //      sale-campaign's `recurringRate` (the "Acc Manager %" slot, e.g.
    //      3%) regardless of how deep the chain is.

    // (1) AM-as-direct-upline payout (uses the AM Campaign's secondaryRate)
    let amDirectAmount = 0;
    let amDirectRate = 0;
    let amDirectCampaignId: string | null = null;
    let amDirectReferralId: string | null = null;
    if (directUplineIsAM && amMembershipReferral) {
      const rate = amMembershipReferral.campaign?.secondaryRate ?? 0;
      if (rate > 0) {
        amDirectRate = rate;
        amDirectAmount = (revenue * rate) / 100;
        amDirectCampaignId = amMembershipReferral.campaign.id;
        amDirectReferralId = amMembershipReferral.id;
      }
    }

    // If the direct upline is the AM but no usable AM-campaign rate is set,
    // fall back to the off-chain path so the AM still gets paid `recurringRate`
    // — this avoids silently dropping the AM's commission when their
    // membership campaign predates the new rate field.
    const amDirectPaid = amDirectAmount > 0;

    // (2) Regular L2 (upline) payout — only when the direct upline is NOT the AM
    const level2Amount =
      !directUplineIsAM && parentRef && (campaign.secondaryRate ?? 0) > 0
        ? (revenue * campaign.secondaryRate!) / 100
        : 0;

    // (3) AM-not-direct payout — always paid via accountManagerId lookup.
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
        if (amDirectAmount > 0 && parentRef && amDirectCampaignId && amDirectReferralId) {
          commission2 = await tx.commission.create({
            data: {
              amount: amDirectAmount,
              percentage: amDirectRate,
              saleAmount: revenue,
              status: 'unpaid',
              description: `Account manager (direct upline) from ${referral.referrer.firstName}'s sale ($${revenue.toFixed(2)})`,
              userId: parentRef.referrerId,
              campaignId: amDirectCampaignId,
              referralId: amDirectReferralId,
              customerId: customer.id,
              transactionId: transaction.id,
            },
          });
        }

        // (2) Regular L2 upline (only when the direct upline is NOT the AM).
        if (level2Amount > 0 && parentRef) {
          commission2 = await tx.commission.create({
            data: {
              amount: level2Amount,
              percentage: campaign.secondaryRate!,
              saleAmount: revenue,
              status: 'unpaid',
              description: `T2 upline from ${referral.referrer.firstName}'s sale ($${revenue.toFixed(2)})`,
              userId: parentRef.referrerId,
              campaignId: campaign.id,
              referralId: parentRef.id,
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

    console.log(`✅ Commission created: $${level1Amount.toFixed(2)} for ${referral.referrer.email}`);
    if (group) {
      console.log(`✅ Chatter commissions: $${perChatter.toFixed(2)} × ${group.members.length} chatters from group ${group.id}`);
    }
    if (amDirectAmount > 0) {
      console.log(
        `✅ AM (direct upline) Commission: $${amDirectAmount.toFixed(2)} (${amDirectRate}%) for ${parentRef?.referrer.email}`,
      );
    } else if (level2Amount > 0) {
      console.log(
        `✅ T2 Upline Commission: $${level2Amount.toFixed(2)} for ${parentRef?.referrer.email}`,
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
    const level2Email = parentRef?.referrer.email;

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
    const refundDirectUplineIsAM =
      !!refundParentRef &&
      !!refundAmId &&
      refundParentRef.referrerId === refundAmId;

    // Look up the AM's hidden membership campaign the same way trackSale
    // does — we cannot rely on the parent-of-parent referral (the AM's R1
    // invite has no parent).
    const amMembershipReferralRefund =
      refundDirectUplineIsAM && refundAmId
        ? await prisma.referral.findFirst({
            where: {
              referredUserId: refundAmId,
              status: 'ACTIVE',
              campaign: {
                visibleToPromoters: false,
                linkedCampaignId: campaign.id,
              },
            },
            orderBy: { acceptedAt: 'desc' },
            select: {
              id: true,
              campaign: {
                select: { id: true, secondaryRate: true },
              },
            },
          })
        : null;

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
    if (refundDirectUplineIsAM && amMembershipReferralRefund) {
      const rate = amMembershipReferralRefund.campaign?.secondaryRate ?? 0;
      if (rate > 0) {
        amDirectRefundRate = rate;
        amDirectRefundAmount = -(refundRevenue * rate) / 100;
        amDirectRefundCampaignId = amMembershipReferralRefund.campaign.id;
        amDirectRefundReferralId = amMembershipReferralRefund.id;
      }
    }

    const amDirectRefundPaid = amDirectRefundAmount !== 0;

    const level2RefundAmount =
      !refundDirectUplineIsAM && refundParentRef && (campaign.secondaryRate ?? 0) > 0
        ? -(refundRevenue * campaign.secondaryRate!) / 100
        : 0;

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
        refundParentRef &&
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
            userId: refundParentRef.referrerId,
            campaignId: amDirectRefundCampaignId,
            referralId: amDirectRefundReferralId,
            customerId: customer.id,
            transactionId: refundTransaction.id,
          },
        });
      }

      // (2) Regular L2 upline reversal — only when the direct upline is NOT the AM.
      if (level2RefundAmount !== 0 && refundParentRef) {
        await tx.commission.create({
          data: {
            amount: level2RefundAmount,
            percentage: campaign.secondaryRate!,
            saleAmount: refundRevenue,
            status: 'paid',
            description: `T2 refund ($${refundRevenue.toFixed(2)})`,
            userId: refundParentRef.referrerId,
            campaignId: campaign.id,
            referralId: refundParentRef.id,
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
