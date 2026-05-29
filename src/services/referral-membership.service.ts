import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * True if the user has an ACTIVE referral on this campaign, or is the invitee
 * on a hidden AM membership campaign whose `linkedCampaignId` points here.
 * Promoters invited under a hidden program only had a row on that program
 * until we also create their public "customer tracking" referral — this covers
 * the gap so invite / permissions logic still works.
 */
export async function isUserParticipantOnCampaign(
  prisma: PrismaClient,
  userId: string,
  campaignId: string,
): Promise<boolean> {
  const direct = await prisma.referral.findFirst({
    where: {
      status: "ACTIVE",
      campaignId,
      OR: [{ referrerId: userId }, { referredUserId: userId }],
    },
    select: { id: true },
  });
  if (direct) return true;

  const viaHiddenLink = await prisma.referral.findFirst({
    where: {
      status: "ACTIVE",
      referredUserId: userId,
      campaign: {
        isActive: true,
        visibleToPromoters: false,
        linkedCampaignId: campaignId,
      },
    },
    select: { id: true },
  });
  return !!viaHiddenLink;
}

/**
 * The invitee's membership row for building level-2 invites: either on the
 * public campaign or on a hidden campaign linked to it.
 */
export async function findMembershipReferralForPublicCampaign(
  prisma: PrismaClient,
  userId: string,
  publicCampaignId: string,
) {
  return prisma.referral.findFirst({
    where: {
      status: "ACTIVE",
      referredUserId: userId,
      OR: [
        { campaignId: publicCampaignId },
        {
          campaign: {
            visibleToPromoters: false,
            linkedCampaignId: publicCampaignId,
          },
        },
      ],
    },
    orderBy: { acceptedAt: "desc" },
  });
}

const defaultSanitizeLocalPart = (raw: string): string => {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || "user";
};

const readReferralMetadataRecord = (
  raw: Prisma.JsonValue | null | undefined,
): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
};

/** Prefer the TeaseMe onboarding row over ad-hoc membership duplicates. */
export const referralDisplayScore = (row: {
  preUser?: { currentStep: number } | null;
  level: number;
}): number =>
  (row.preUser ? 1_000_000 : 0) +
  (row.preUser?.currentStep ?? 0) * 1000 +
  (row.level ?? 0);

/**
 * Collapse multiple list rows that share the same promoted user (`referredUserId`)
 * into one card. Pending invites (no invitee user yet) are never merged.
 */
export const dedupeReferralsByPromoter = <
  T extends {
    referredUserId?: string | null;
    referredUser?: { id: string } | null;
    preUser?: { currentStep: number } | null;
    level: number;
  },
>(
  rows: T[],
): T[] => {
  const best = new Map<string, T>();
  const passthrough: T[] = [];
  for (const row of rows) {
    const promoterId = row.referredUser?.id ?? row.referredUserId ?? null;
    if (!promoterId) {
      passthrough.push(row);
      continue;
    }
    const existing = best.get(promoterId);
    if (!existing || referralDisplayScore(row) > referralDisplayScore(existing)) {
      best.set(promoterId, row);
    }
  }
  return [...passthrough, ...best.values()];
};

/**
 * Cancel every other ACTIVE "I am the invitee" referral for this promoter,
 * keeping the canonical row (typically the TeaseMe email-invite that owns the
 * PreUser). Marks superseded rows with `source: am-migration` so they stay
 * out of the Models grid filters.
 */
export async function supersedeDuplicateInviteeReferrals(
  client: Prisma.TransactionClient | PrismaClient,
  args: { keepReferralId: string; promotedUserId: string },
): Promise<number> {
  const duplicates = await client.referral.findMany({
    where: {
      referredUserId: args.promotedUserId,
      status: "ACTIVE",
      id: { not: args.keepReferralId },
    },
    select: { id: true, metadata: true },
  });

  let superseded = 0;
  for (const ref of duplicates) {
    const existing = readReferralMetadataRecord(ref.metadata);
    await client.referral.update({
      where: { id: ref.id },
      data: {
        status: "CANCELLED",
        metadata: {
          ...existing,
          source: "am-migration",
          supersededByReferralId: args.keepReferralId,
          migratedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    superseded += 1;
  }

  if (superseded > 0) {
    console.info("[supersedeDuplicateInviteeReferrals] cancelled duplicates", {
      keepReferralId: args.keepReferralId,
      promotedUserId: args.promotedUserId,
      superseded,
    });
  }

  return superseded;
}

/**
 * Ensures a second ACTIVE referral on the *public* program (`referredUserId`
 * null) so sales/attribution and `isParticipant` on the linked public campaign
 * keep working while the original AM invite row can stay on the hidden
 * membership campaign.
 */
export async function ensureCustomerTrackingReferralForPromotedUser(
  prisma: PrismaClient,
  args: {
    inviteReferralId: string;
    promotedUserId: string;
    promotedEmail: string;
  },
): Promise<void> {
  const { inviteReferralId, promotedUserId, promotedEmail } = args;
  const sanitizeLocalPart = defaultSanitizeLocalPart;

  const referral = await prisma.referral.findUnique({
    where: { id: inviteReferralId },
    include: { campaign: true },
  });
  if (!referral || referral.referredUserId !== promotedUserId) return;
  if (referral.status !== "ACTIVE") return;

  let assignedCampaignId = referral.campaignId;
  const camp = referral.campaign;
  if (!camp.visibleToPromoters) {
    if (camp.linkedCampaignId) {
      assignedCampaignId = camp.linkedCampaignId;
    } else {
      console.warn(
        "[ensureCustomerTrackingReferral] hidden campaign missing linkedCampaignId; skipping",
        {
          inviteReferralId,
          campaignId: camp.id,
        },
      );
      return;
    }
  }

  // Build a deterministic inviteCode so that concurrent calls racing past the
  // findFirst guard still collapse into one row: if two writes land at the
  // same moment they both try to insert the same inviteCode and Postgres
  // raises a unique-constraint violation (P2002) on the second one, which
  // we treat as "already created, nothing to do". Without this the only
  // guard was a non-atomic check-then-insert pair.
  const localPart = promotedEmail.split("@")[0] ?? "user";
  const local = sanitizeLocalPart(localPart) || "user";
  const hashSuffix = createHash("sha256")
    .update(`${promotedUserId}:${assignedCampaignId}`)
    .digest("hex")
    .slice(0, 8);
  const customerTrackingCode = `${local}_${hashSuffix}`;

  const referrerTracking = await prisma.referral.findFirst({
    where: {
      referrerId: referral.referrerId,
      referredUserId: null,
      status: "ACTIVE",
      campaignId: assignedCampaignId,
    },
    select: { id: true },
  });

  try {
    await prisma.referral.create({
      data: {
        inviteCode: customerTrackingCode,
        campaignId: assignedCampaignId,
        referrerId: promotedUserId,
        referredUserId: null,
        parentReferralId: referrerTracking?.id ?? null,
        status: "ACTIVE",
        level: referral.level + 1,
        acceptedAt: new Date(),
      },
    });

    console.info("[ensureCustomerTrackingReferral] created", {
      userId: promotedUserId,
      campaignId: assignedCampaignId,
    });
  } catch (err) {
    // P2002 = unique constraint violation — a concurrent call already inserted
    // the same deterministic inviteCode, so the row exists and we're done.
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === "P2002") return;
    throw err;
  }
}
