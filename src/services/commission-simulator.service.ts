import { PrismaClient, UserRole, UserType } from '@prisma/client';

const prisma = new PrismaClient();

const hiddenLinkedCampaignClause = (publicSaleCampaignId: string) => ({
  visibleToPromoters: false,
  isActive: true,
  linkedCampaignId: publicSaleCampaignId,
});

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

  const sellerAmEmail = emailFromMeta(inviterReferralMetadata);
  if (sellerAmEmail) {
    const id = await findUserByEmail(sellerAmEmail);
    if (id) return id;
  }

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

type ReferralShape = {
  id: string;
  referrerId: string;
  campaign: {
    id: string;
    name: string;
    commissionRate: number;
    secondaryRate: number | null;
    recurringRate: number | null;
  };
  referrer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  parentReferral: {
    id: string;
    referrerId: string;
    referrer: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    };
    parentReferral: {
      id: string;
      referrerId: string;
      referrer: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
      };
    } | null;
  } | null;
};

const promoterUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  userType: true,
  accountManagerId: true,
} as const;

/** Admin-assigned promoters may lack referral rows; synthesize upline from AM assignment. */
async function trySyntheticReferralFromPromoterAssignment(
  sellerUserId: string,
  campaignId: string,
): Promise<ReferralShape | null> {
  const seller = await prisma.user.findUnique({
    where: { id: sellerUserId },
    select: promoterUserSelect,
  });
  if (!seller) return null;
  if (
    seller.userType !== UserType.PROMOTER &&
    seller.userType !== UserType.TEAM_MANAGER
  ) {
    return null;
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, isActive: true },
    select: {
      id: true,
      name: true,
      commissionRate: true,
      secondaryRate: true,
      recurringRate: true,
    },
  });
  if (!campaign) return null;

  let uplineId = seller.accountManagerId;
  if (!uplineId) {
    const inviter = await prisma.referral.findFirst({
      where: { referredUserId: sellerUserId, status: 'ACTIVE' },
      orderBy: { acceptedAt: 'desc' },
      select: { referrerId: true },
    });
    uplineId = inviter?.referrerId ?? null;
  }
  if (!uplineId) return null;

  const upline = await prisma.user.findUnique({
    where: { id: uplineId },
    select: promoterUserSelect,
  });
  if (!upline) return null;

  const sellerShape = {
    id: seller.id,
    email: seller.email,
    firstName: seller.firstName,
    lastName: seller.lastName,
  };

  return {
    id: `synthetic-${sellerUserId}-${campaignId}`,
    referrerId: seller.id,
    campaign,
    referrer: sellerShape,
    parentReferral: {
      id: `synthetic-parent-${uplineId}`,
      referrerId: upline.id,
      referrer: {
        id: upline.id,
        email: upline.email,
        firstName: upline.firstName,
        lastName: upline.lastName,
      },
      parentReferral: null,
    },
  };
}

async function resolveSaleReferralForSeller(
  sellerUserId: string,
  campaignId: string,
): Promise<ReferralShape | null> {
  const seller = await prisma.user.findUnique({
    where: { id: sellerUserId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      referralsReceived: {
        where: { status: 'ACTIVE', campaignId },
        select: {
          id: true,
          referrerId: true,
          campaign: {
            select: {
              id: true,
              name: true,
              commissionRate: true,
              secondaryRate: true,
              recurringRate: true,
            },
          },
          referrer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          parentReferral: {
            select: {
              id: true,
              referrerId: true,
              referrer: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
              parentReferral: {
                select: {
                  id: true,
                  referrerId: true,
                  referrer: {
                    select: {
                      id: true,
                      email: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { acceptedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!seller?.referralsReceived.length) return null;

  const inviteRow = seller.referralsReceived[0];
  return {
    id: inviteRow.id,
    referrerId: seller.id,
    campaign: inviteRow.campaign,
    referrer: {
      id: seller.id,
      email: seller.email,
      firstName: seller.firstName,
      lastName: seller.lastName,
    },
    parentReferral: inviteRow.parentReferral
      ? {
          id: inviteRow.id,
          referrerId: inviteRow.referrerId,
          referrer: inviteRow.referrer,
          parentReferral: inviteRow.parentReferral,
        }
      : {
          id: inviteRow.id,
          referrerId: inviteRow.referrerId,
          referrer: inviteRow.referrer,
          parentReferral: null,
        },
  };
}

export type CommissionSimSlice = {
  role: 'seller' | 'upline' | 'am_direct' | 'am_indirect' | 'chatter';
  label: string;
  userId: string;
  name: string;
  email: string;
  percentage: number;
  amount: number;
};

export type CommissionSimulation = {
  saleAmount: number;
  campaign: {
    id: string;
    name: string;
    commissionRate: number;
    secondaryRate: number | null;
    recurringRate: number | null;
  };
  seller: {
    id: string;
    name: string;
    email: string;
  };
  slices: CommissionSimSlice[];
  totalPaidOut: number;
};

const displayName = (u: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) => {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.email;
};

export async function simulateCommissionForSeller(args: {
  sellerUserId: string;
  saleAmount: number;
  campaignId?: string;
  referralId?: string;
}): Promise<CommissionSimulation> {
  const { sellerUserId, saleAmount } = args;
  if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
    throw new Error('saleAmount must be a positive number');
  }

  let referral: ReferralShape | null = null;

  let resolvedSellerId = sellerUserId;

  if (args.referralId) {
    const row = await prisma.referral.findUnique({
      where: { id: args.referralId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            commissionRate: true,
            secondaryRate: true,
            recurringRate: true,
          },
        },
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        referredUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        parentReferral: {
          include: {
            referrer: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            parentReferral: {
              include: {
                referrer: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (row?.referredUser) {
      resolvedSellerId = row.referredUser.id;
      referral = await resolveSaleReferralForSeller(
        row.referredUser.id,
        row.campaignId,
      );
    } else if (row) {
      resolvedSellerId = row.referrerId;
      referral = {
        id: row.id,
        referrerId: row.referrerId,
        campaign: row.campaign,
        referrer: row.referrer,
        parentReferral: row.parentReferral
          ? {
              id: row.parentReferral.id,
              referrerId: row.parentReferral.referrerId,
              referrer: row.parentReferral.referrer,
              parentReferral: row.parentReferral.parentReferral
                ? {
                    id: row.parentReferral.parentReferral.id,
                    referrerId: row.parentReferral.parentReferral.referrerId,
                    referrer: row.parentReferral.parentReferral.referrer,
                  }
                : null,
            }
          : null,
      };
    }
  }

  if (!referral && args.campaignId && resolvedSellerId) {
    referral = await resolveSaleReferralForSeller(
      resolvedSellerId,
      args.campaignId,
    );
  }

  if (!referral && resolvedSellerId) {
    const fallback = await prisma.referral.findFirst({
      where: {
        referredUserId: resolvedSellerId,
        status: 'ACTIVE',
        ...(args.campaignId ? { campaignId: args.campaignId } : {}),
      },
      orderBy: { acceptedAt: 'desc' },
      select: { campaignId: true },
    });
    if (fallback) {
      referral = await resolveSaleReferralForSeller(
        resolvedSellerId,
        fallback.campaignId,
      );
    }
  }

  if (!referral && args.campaignId && resolvedSellerId) {
    referral = await trySyntheticReferralFromPromoterAssignment(
      resolvedSellerId,
      args.campaignId,
    );
  }

  if (!referral) {
    throw new Error('No active referral found for this promoter on the campaign');
  }

  const isSyntheticReferral = referral.id.startsWith('synthetic-');

  const revenue = saleAmount;
  const campaign = referral.campaign;

  const promoterWithGroup = await prisma.user.findUnique({
    where: { id: referral.referrerId },
    select: {
      accountManagerId: true,
      chatterGroup: {
        select: {
          id: true,
          name: true,
          commissionPercentage: true,
          members: {
            select: {
              chatterId: true,
              chatter: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
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
  const publicUplineUserId = parentUplineUserId ?? inviterReferrerId ?? null;

  const effectiveAmId =
    sellingPromoterAmId ??
    (await resolveAmFromReferralChain({
      inviterReferralMetadata: inviterOnCampaign?.metadata ?? null,
      publicUplineUserId,
    }));

  const membershipSubjectUserId = publicUplineUserId;

  const amMembershipReferral = await resolveAmMembershipReferralForSale({
    publicUplineUserId: membershipSubjectUserId,
    sellerUserId: referral.referrerId,
    publicSaleCampaignId: campaign.id,
  });

  const level1Amount = (revenue * campaign.commissionRate) / 100;
  const group =
    promoterWithGroup?.chatterGroup &&
    promoterWithGroup.chatterGroup.members.length > 0
      ? promoterWithGroup.chatterGroup
      : null;
  const perChatter = group
    ? (revenue * group.commissionPercentage) / 100 / group.members.length
    : 0;

  let amDirectAmount = 0;
  let amDirectRate = 0;
  if (amMembershipReferral) {
    const rate = amMembershipReferral.campaign?.secondaryRate ?? 0;
    if (rate > 0) {
      amDirectRate = rate;
      amDirectAmount = (revenue * rate) / 100;
    }
  }

  if (amDirectAmount === 0 && membershipSubjectUserId) {
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
    }
  }

  // Promoters assigned to an AM without a formal invite still earn AM direct %.
  if (
    amDirectAmount === 0 &&
    isSyntheticReferral &&
    sellingPromoterAmId &&
    membershipSubjectUserId === sellingPromoterAmId
  ) {
    const hiddenProgram = await prisma.campaign.findFirst({
      where: hiddenLinkedCampaignClause(campaign.id),
      orderBy: { createdAt: 'asc' },
      select: { secondaryRate: true },
    });
    const rate = hiddenProgram?.secondaryRate ?? 0;
    if (rate > 0) {
      amDirectRate = rate;
      amDirectAmount = (revenue * rate) / 100;
    }
  }

  const amDirectPaid = amDirectAmount > 0;
  const skipPublicReferralSliceToAssignedAm =
    !!publicUplineUserId &&
    !!sellingPromoterAmId &&
    publicUplineUserId === sellingPromoterAmId;

  const level2Amount =
    !amDirectPaid &&
    !skipPublicReferralSliceToAssignedAm &&
    !!publicUplineUserId &&
    (campaign.secondaryRate ?? 0) > 0
      ? (revenue * campaign.secondaryRate!) / 100
      : 0;

  let amIndirectAmount = 0;
  let amIndirectRate = 0;
  let amIndirectUserId: string | null = null;
  if (!amDirectPaid && effectiveAmId && (campaign.recurringRate ?? 0) > 0) {
    amIndirectRate = campaign.recurringRate!;
    amIndirectAmount = (revenue * amIndirectRate) / 100;
    amIndirectUserId = effectiveAmId;
  }

  const slices: CommissionSimSlice[] = [];

  slices.push({
    role: 'seller',
    label: 'Promoter (seller)',
    userId: referral.referrer.id,
    name: displayName(referral.referrer),
    email: referral.referrer.email,
    percentage: campaign.commissionRate,
    amount: level1Amount,
  });

  if (group) {
    for (const member of group.members) {
      const chatter = member.chatter;
      slices.push({
        role: 'chatter',
        label: `Chatter (${group.name})`,
        userId: chatter.id,
        name: displayName(chatter),
        email: chatter.email,
        percentage:
          Math.round((group.commissionPercentage / group.members.length) * 100) /
          100,
        amount: perChatter,
      });
    }
  }

  if (amDirectAmount > 0 && membershipSubjectUserId) {
    const amDirectUser = await prisma.user.findUnique({
      where: { id: membershipSubjectUserId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (amDirectUser) {
      slices.push({
        role: 'am_direct',
        label: 'Account manager (direct upline)',
        userId: amDirectUser.id,
        name: displayName(amDirectUser),
        email: amDirectUser.email,
        percentage: amDirectRate,
        amount: amDirectAmount,
      });
    }
  } else if (level2Amount > 0 && publicUplineUserId) {
    const uplineUser = await prisma.user.findUnique({
      where: { id: publicUplineUserId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (uplineUser) {
      slices.push({
        role: 'upline',
        label: 'Referral upline',
        userId: uplineUser.id,
        name: displayName(uplineUser),
        email: uplineUser.email,
        percentage: campaign.secondaryRate!,
        amount: level2Amount,
      });
    }
  }

  if (amIndirectAmount > 0 && amIndirectUserId) {
    const amUser = await prisma.user.findUnique({
      where: { id: amIndirectUserId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (amUser) {
      slices.push({
        role: 'am_indirect',
        label: 'Account manager (team)',
        userId: amUser.id,
        name: displayName(amUser),
        email: amUser.email,
        percentage: amIndirectRate,
        amount: amIndirectAmount,
      });
    }
  }

  const totalPaidOut = slices.reduce((sum, s) => sum + s.amount, 0);

  return {
    saleAmount: revenue,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      commissionRate: campaign.commissionRate,
      secondaryRate: campaign.secondaryRate,
      recurringRate: campaign.recurringRate,
    },
    seller: {
      id: referral.referrer.id,
      name: displayName(referral.referrer),
      email: referral.referrer.email,
    },
    slices,
    totalPaidOut,
  };
}
