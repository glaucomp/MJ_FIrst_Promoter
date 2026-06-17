import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
import { ApiKeyRequest } from '../middleware/apiKey.middleware';
import {
  ensureCustomerTrackingReferralForPromotedUser,
  pickCanonicalInviteeReferral,
} from '../services/referral-membership.service';
import { isStablePayerCustomerEmail } from '../utils/payer-email';

const saleReferralInclude = {
  campaign: true,
  referrer: true,
  parentReferral: {
    include: {
      referrer: true,
      campaign: true,
      parentReferral: {
        include: {
          referrer: true,
          campaign: true,
        },
      },
    },
  },
} as const;

const prisma = new PrismaClient();

/**
 * When a seller has no direct `accountManagerId` assignment (common when they
 * joined via the referral invite flow rather than the admin form), walk up the
 * referral metadata chain to find the account manager email and resolve them.
 *
 * Resolution order:
 *   1. The invite referral that brought the **seller** in (inviterReferral)
 *      carries `accountManagerEmail` going forward after our recent fix.
 *   2. The invite referral that brought the **direct upline** in — covers
 *      existing rows where Leonida's invite still has null accountManagerEmail
 *      but Glauco's invite (Leo → Glauco) correctly has Leo's email.
 */
async function resolveAmFromReferralChain(args: {
  inviterReferralMetadata: unknown;
  publicUplineUserId: string | null;
}): Promise<string | null> {
  const { inviterReferralMetadata, publicUplineUserId } = args;

  const emailFromMeta = (raw: unknown): string | null => {
    if (!raw || typeof raw !== 'object') return null;
    const v = (raw as Record<string, unknown>).accountManagerEmail;
    return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
  };

  const findUserByEmail = async (email: string) => {
    const u = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    return u?.id ?? null;
  };

  // 1) Seller's own invite metadata
  const sellerAmEmail = emailFromMeta(inviterReferralMetadata);
  if (sellerAmEmail) {
    const id = await findUserByEmail(sellerAmEmail);
    if (id) return id;
  }

  // 2) Upline's own invite metadata (covers legacy rows where seller metadata is null)
  if (publicUplineUserId) {
    const uplineInvite = await prisma.referral.findFirst({
      where: { referredUserId: publicUplineUserId, status: 'ACTIVE' },
      select: { metadata: true },
      orderBy: { acceptedAt: 'desc' },
    });
    const uplineAmEmail = emailFromMeta(uplineInvite?.metadata);
    if (uplineAmEmail) {
      const id = await findUserByEmail(uplineAmEmail);
      if (id) return id;
    }
  }

  return null;
}

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

/**
 * When AM invites an influencer, prod often has only a **public** person referral
 * (no parallel hidden referral row). `resolveAmMembershipReferralForSale` then
 * misses and we incorrectly pay public `secondaryRate` (T2). If the upline is an
 * AM/Admin on the direct parent/inviter line, pay the **linked hidden** program's
 * `secondaryRate` using the public AM→seller referral id for attribution.
 */
async function trySyntheticAmDirectFromLinkedHiddenProgram(args: {
  publicUplineUserId: string;
  sellerUserId: string;
  publicSaleCampaignId: string;
  inviterReferrerId: string | null;
  parentUplineUserId: string | null;
}): Promise<{ hiddenCampaignId: string; secondaryRate: number; referralId: string } | null> {
  const {
    publicUplineUserId,
    sellerUserId,
    publicSaleCampaignId,
    inviterReferrerId,
    parentUplineUserId,
  } = args;

  const uplineUser = await prisma.user.findUnique({
    where: { id: publicUplineUserId },
    select: { userType: true, role: true },
  });
  const uplineActsAsAm =
    uplineUser?.role === UserRole.ADMIN ||
    uplineUser?.userType === UserType.ACCOUNT_MANAGER;
  if (!uplineActsAsAm) return null;

  const onDirectLineFromThisUpline =
    inviterReferrerId === publicUplineUserId ||
    parentUplineUserId === publicUplineUserId;
  if (!onDirectLineFromThisUpline) return null;

  const hiddenProgram = await prisma.campaign.findFirst({
    where: hiddenLinkedCampaignClause(publicSaleCampaignId),
    orderBy: { createdAt: 'asc' },
    select: { id: true, secondaryRate: true },
  });
  const rate = hiddenProgram?.secondaryRate ?? 0;
  if (!hiddenProgram || rate <= 0) return null;

  const publicAmToSeller = await prisma.referral.findFirst({
    where: {
      referrerId: publicUplineUserId,
      referredUserId: sellerUserId,
      campaignId: publicSaleCampaignId,
      status: 'ACTIVE',
    },
    orderBy: { acceptedAt: 'desc' },
    select: { id: true },
  });
  if (!publicAmToSeller) return null;

  return {
    hiddenCampaignId: hiddenProgram.id,
    secondaryRate: rate,
    referralId: publicAmToSeller.id,
  };
}

/**
 * Username-identified sales attribute to the promoter (seller), not a payer row.
 * When no customer-tracking referral exists yet, synthesize the sale shape from
 * the promoter's invite row so commissions still flow (legacy behavior).
 */
async function buildSyntheticSaleReferralFromInvite(args: {
  promoterUser: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  inviteReferralId: string;
  saleCampaignId: string;
}) {
  const { promoterUser, inviteReferralId, saleCampaignId } = args;

  const [saleCampaign, inviteRow] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: saleCampaignId } }),
    prisma.referral.findUnique({
      where: { id: inviteReferralId },
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
                campaign: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!saleCampaign || !inviteRow) return null;

  return {
    id: inviteRow.id,
    campaign: saleCampaign,
    referrerId: promoterUser.id,
    referrer: {
      id: promoterUser.id,
      email: promoterUser.email,
      firstName: promoterUser.firstName,
      lastName: promoterUser.lastName,
    },
    parentReferral: {
      id: inviteRow.id,
      referrer: inviteRow.referrer,
      referrerId: inviteRow.referrerId,
      campaign: inviteRow.campaign,
      parentReferral: inviteRow.parentReferral ?? null,
    },
  };
}

/** Stable payer identity for customer rows when track/sale omits a real email. */
function resolveSaleCustomerIdentity(args: {
  email?: string;
  uid?: string;
  event_id: string;
}): { email: string; name: string } {
  const { email, uid, event_id } = args;
  if (email) {
    return { email, name: email.split('@')[0] };
  }
  if (uid) {
    return { email: `uid-${uid}@temp.com`, name: `User ${uid}` };
  }
  // Username-only sales have no payer email/uid — key by event_id so each sale
  // gets its own customer instead of collapsing on uid-undefined@temp.com.
  // Gift flows treat *@temp.com placeholders via isSyntheticPayerEmail().
  return { email: `event-${event_id}@temp.com`, name: `Sale ${event_id}` };
}

// POST /api/v2/track/sale
export const trackSale = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { email, uid, amount, event_id, ref_id, tid, plan } = req.body;
    // Accept both "username" and "Username" from callers
    const username: string | undefined = req.body.username ?? req.body.Username;

    // Validation
    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    // username alone is sufficient to identify the promoter; email/uid are
    // only required when username is absent (customer-based referral lookup).
    if (!username && !email && !uid) {
      return res.status(400).json({ error: 'username, email, or uid is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    const customerIdentity = resolveSaleCustomerIdentity({ email, uid, event_id });

    // Prevent duplicate processing of the same payment event.
    const existingSaleTransaction = await prisma.transaction.findUnique({
      where: { eventId: event_id },
      select: { id: true },
    });
    if (existingSaleTransaction) {
      return res.status(200).json({
        success: true,
        message: 'Sale already tracked',
        event_id,
        duplicate: true
      });
    }

    // Repeat sales from the same payer reuse one customer row (real email or uid-*).
    let existingPayerCustomer: { id: string } | null = null;
    if (isStablePayerCustomerEmail(customerIdentity.email)) {
      existingPayerCustomer = await prisma.customer.findFirst({
        where: { email: customerIdentity.email },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
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
        include: saleReferralInclude,
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
              campaignId: true,
              level: true,
              preUser: { select: { currentStep: true } },
              campaign: {
                select: {
                  visibleToPromoters: true,
                  linkedCampaignId: true,
                },
              },
            },
          },
        },
      });

      const inviteRow = user
        ? pickCanonicalInviteeReferral(user.referralsReceived)
        : null;

      if (user && inviteRow) {
        const camp = inviteRow.campaign;
        let saleCampaignId = inviteRow.campaignId;
        if (!camp.visibleToPromoters && camp.linkedCampaignId) {
          saleCampaignId = camp.linkedCampaignId;
        }

        const customerTrackingWhere = {
          referrerId: user.id,
          referredUserId: null,
          status: 'ACTIVE' as const,
          campaignId: saleCampaignId,
        };

        // Prefer a payer-specific row when we know who paid.
        if (email) {
          referral = await prisma.referral.findFirst({
            where: {
              referrerId: user.id,
              status: 'ACTIVE',
              campaignId: saleCampaignId,
              referredUser: { email },
            },
            include: saleReferralInclude,
          });
        } else if (uid) {
          referral = await prisma.referral.findFirst({
            where: {
              referrerId: user.id,
              status: 'ACTIVE',
              campaignId: saleCampaignId,
              referredUserId: uid,
            },
            include: saleReferralInclude,
          });
        }

        if (!referral) {
          referral = await prisma.referral.findFirst({
            where: customerTrackingWhere,
            include: saleReferralInclude,
          });
        }

        // Promoters enrolled via invite should already have a customer-tracking
        // shell row; create one on demand for legacy accounts that don't.
        if (!referral && user.email) {
          await ensureCustomerTrackingReferralForPromotedUser(prisma, {
            inviteReferralId: inviteRow.id,
            promotedUserId: user.id,
            promotedEmail: user.email,
          });
          referral = await prisma.referral.findFirst({
            where: customerTrackingWhere,
            include: saleReferralInclude,
          });
        }

        // No tracking row (e.g. promoter has no email for shell creation) —
        // build a synthetic sale referral so username sales still attribute.
        if (!referral) {
          referral = await buildSyntheticSaleReferralFromInvite({
            promoterUser: user,
            inviteReferralId: inviteRow.id,
            saleCampaignId,
          });
        }
      }
    }

    // Fall back to email/uid when earlier lookups (ref_id, username) did not resolve.
    // email/uid identify the referred payer; username identifies the earning promoter.
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
        include: saleReferralInclude,
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
      select: { id: true, referrerId: true, metadata: true },
    });
    const inviterReferrerId = inviterOnCampaign?.referrerId ?? null;

    // Who sits "above" the seller on this public campaign: tracking parent
    // first, else the person who invited the seller onto this campaign.
    // - AM → influencer: usually inviter = AM (parent often null) → AM path.
    // - Influencer → friend: parent or inviter = influencer → public referral %.
    const publicUplineUserId = parentUplineUserId ?? inviterReferrerId ?? null;

    // When the seller has no DB-level AM assignment (joined via referral invite
    // flow rather than admin form), resolve the AM from the referral metadata
    // chain so they still receive the campaign's AM commission %.
    const effectiveAmId =
      sellingPromoterAmId ??
      (await resolveAmFromReferralChain({
        inviterReferralMetadata: inviterOnCampaign?.metadata ?? null,
        publicUplineUserId,
      }));

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

    if (
      amDirectAmount === 0 &&
      membershipSubjectUserId
    ) {
      const synthetic = await trySyntheticAmDirectFromLinkedHiddenProgram({
        publicUplineUserId: membershipSubjectUserId,
        sellerUserId: referral.referrerId,
        publicSaleCampaignId: campaign.id,
        inviterReferrerId,
        parentUplineUserId,
      });
      if (synthetic) {
        amDirectRate = synthetic.secondaryRate;
        amDirectAmount = (revenue * synthetic.secondaryRate) / 100;
        amDirectCampaignId = synthetic.hiddenCampaignId;
        amDirectReferralId = synthetic.referralId;
      }
    }

    // If the upline has no usable hidden-campaign rate, fall back to other
    // paths (public L2 and/or recurring AM %).
    const amDirectPaid = amDirectAmount > 0;
    const directAmRecipientUserId = amDirectPaid
      ? membershipSubjectUserId
      : null;

    // Only suppress the public L2 slice when the *DB-assigned* AM is the
    // direct upline (Leo → Glauco directly). Don't skip it based on the
    // resolved chain AM, because that AM (Leo) may be several hops away and
    // the upline (Glauco) should still get their public referral %.
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
    // Uses `effectiveAmId` so promoters who joined via the referral invite flow
    // (no DB-level accountManagerId) still generate an AM commission, resolved
    // from the referral metadata chain (seller's invite → upline's invite).
    let amIndirectAmount = 0;
    let amIndirectRate = 0;
    let amIndirectUserId: string | null = null;
    let amIndirectReferralId: string | null = null;
    if (
      !amDirectPaid &&
      effectiveAmId &&
      (campaign.recurringRate ?? 0) > 0
    ) {
      amIndirectRate = campaign.recurringRate!;
      amIndirectAmount = (revenue * amIndirectRate) / 100;
      amIndirectUserId = effectiveAmId;
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
        const customer = existingPayerCustomer
          ? await tx.customer.update({
              where: { id: existingPayerCustomer.id },
              data: {
                revenue: { increment: revenue },
                ...(plan ? { subscriptionType: plan } : {}),
                status: 'active',
              },
            })
          : await tx.customer.create({
              data: {
                email: customerIdentity.email,
                name: customerIdentity.name,
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

    // Find the original sale by event_id (each sale has a unique transaction row).
    const originalTransaction = await prisma.transaction.findUnique({
      where: { eventId: event_id },
      include: {
        customer: {
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
        }
      }
    });

    const customer = originalTransaction?.customer;
    if (!customer || !customer.referral) {
      return res.status(404).json({ error: 'Original sale not found' });
    }

    const refundRevenue = amount / 100; // amount is in cents, convert to dollars
    const referral = customer.referral; // narrowed: null already excluded above
    const campaign = referral.campaign;

    // Read-only lookups before the write transaction
    const promoterWithGroupRefund = await prisma.user.findUnique({
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
    });

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
      select: { id: true, referrerId: true, metadata: true },
    });
    const refundInviterReferrerId = inviterOnCampaignRefund?.referrerId ?? null;
    const refundPublicUplineUserId =
      refundParentUplineUserId ?? refundInviterReferrerId ?? null;

    // Mirror the sale-path AM resolution: walk the referral chain when the
    // seller has no DB-level AM assignment so the refund commission correctly
    // reverses whatever the sale wrote.
    const effectiveRefundAmId =
      refundAmId ??
      (await resolveAmFromReferralChain({
        inviterReferralMetadata: inviterOnCampaignRefund?.metadata ?? null,
        publicUplineUserId: refundPublicUplineUserId,
      }));

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

    if (
      amDirectRefundAmount === 0 &&
      refundPublicUplineUserId
    ) {
      const syntheticRefund = await trySyntheticAmDirectFromLinkedHiddenProgram({
        publicUplineUserId: refundPublicUplineUserId,
        sellerUserId: referral.referrerId,
        publicSaleCampaignId: campaign.id,
        inviterReferrerId: refundInviterReferrerId,
        parentUplineUserId: refundParentUplineUserId,
      });
      if (syntheticRefund) {
        amDirectRefundRate = syntheticRefund.secondaryRate;
        amDirectRefundAmount = -(refundRevenue * syntheticRefund.secondaryRate) / 100;
        amDirectRefundCampaignId = syntheticRefund.hiddenCampaignId;
        amDirectRefundReferralId = syntheticRefund.referralId;
      }
    }

    const amDirectRefundPaid = amDirectRefundAmount !== 0;

    const refundSkipPublicReferralSliceToAssignedAm =
      !!refundPublicUplineUserId &&
      !!refundAmId &&
      refundPublicUplineUserId === refundAmId; // intentionally uses raw DB-assigned AM, not effective

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
      effectiveRefundAmId &&
      (campaign.recurringRate ?? 0) > 0
    ) {
      amIndirectRefundRate = campaign.recurringRate!;
      amIndirectRefundAmount = -(refundRevenue * amIndirectRefundRate) / 100;
      amIndirectRefundUserId = effectiveRefundAmId;
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
        data: {
          revenue: { decrement: refundRevenue },
          status:
            (await tx.transaction.count({
              where: {
                customerId: customer.id,
                type: 'sale',
                status: 'completed',
                id: { not: originalTransaction.id },
              },
            })) === 0
              ? 'cancelled'
              : 'active',
        },
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
