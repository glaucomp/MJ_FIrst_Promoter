import type { PrismaClient } from "@prisma/client";

/**
 * When an invitee becomes ACTIVE on a hidden (e.g. AM-only) program, move their
 * membership referral onto the linked public campaign and optionally attach
 * `parentReferralId` to the inviter's customer-tracking row.
 *
 * Historically we also inserted a second `Referral` (`referredUserId: null`) per
 * promoter; that duplicated the membership row in "My Promoters". We now only
 * evolve the original invite row in place.
 */
export async function syncAcceptedInviteReferralToPublicProgram(
  prisma: PrismaClient,
  args: { inviteReferralId: string; promotedUserId: string },
): Promise<void> {
  const { inviteReferralId, promotedUserId } = args;

  const referral = await prisma.referral.findUnique({
    where: { id: inviteReferralId },
    include: { campaign: true },
  });

  if (!referral || referral.referredUserId !== promotedUserId) return;
  if (referral.status !== "ACTIVE") return;

  const promotedUser = await prisma.user.findUnique({
    where: { id: promotedUserId },
    select: { role: true },
  });
  const shouldPreserveHiddenMembership =
    promotedUser?.role === "ACCOUNT_MANAGER";

  let assignedCampaignId = referral.campaignId;
  const camp = referral.campaign;
  if (!camp.visibleToPromoters && !shouldPreserveHiddenMembership) {
    if (camp.linkedCampaignId) {
      assignedCampaignId = camp.linkedCampaignId;
    } else {
      const visibleCampaigns = await prisma.campaign.findMany({
        where: { isActive: true, visibleToPromoters: true },
        orderBy: { createdAt: "asc" },
        take: 2,
      });
      if (visibleCampaigns.length === 0) {
        console.warn(
          "[syncAcceptedInviteReferralToPublicProgram] no visible campaign; skipping",
          { inviteReferralId },
        );
        return;
      }
      if (visibleCampaigns.length > 1) {
        console.warn(
          "[syncAcceptedInviteReferralToPublicProgram] ambiguous visible campaigns; skipping",
          { inviteReferralId, visibleCampaignIds: visibleCampaigns.map((campaign) => campaign.id) },
        );
        return;
      }
      assignedCampaignId = visibleCampaigns[0].id;
    }
  }

  const referrerTracking = await prisma.referral.findFirst({
    where: {
      referrerId: referral.referrerId,
      campaignId: assignedCampaignId,
      referredUserId: null,
      status: "ACTIVE",
    },
  });

  const data: { campaignId?: string; parentReferralId?: string } = {};
  if (referral.campaignId !== assignedCampaignId) {
    data.campaignId = assignedCampaignId;
  }
  if (
    referrerTracking &&
    referral.parentReferralId !== referrerTracking.id
  ) {
    data.parentReferralId = referrerTracking.id;
  }

  if (Object.keys(data).length === 0) return;

  await prisma.referral.update({
    where: { id: inviteReferralId },
    data,
  });

  console.info("[syncAcceptedInviteReferralToPublicProgram] updated", {
    inviteReferralId,
    promotedUserId,
    ...data,
  });
}
