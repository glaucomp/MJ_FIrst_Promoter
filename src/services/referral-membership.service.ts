import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

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

/** Pick the canonical ACTIVE invitee row for a promoted user (highest score; lowest id breaks ties). */
export function pickCanonicalInviteeReferral<
  T extends {
    id: string;
    preUser?: { currentStep: number } | null;
    level: number;
  },
>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((winner, row) => {
    const rowScore = referralDisplayScore(row);
    const winnerScore = referralDisplayScore(winner);
    if (rowScore > winnerScore) return row;
    if (rowScore < winnerScore) return winner;
    return row.id < winner.id ? row : winner;
  });
}

/**
 * Public program key for list dedupe. Hidden AM membership rows map through
 * `linkedCampaignId` so a promoter's hidden + public rows for the same company
 * collapse, while the same person on two companies stays as two cards.
 */
export function publicCampaignKeyForReferral(row: {
  campaignId?: string | null;
  campaign?: {
    id?: string | null;
    visibleToPromoters?: boolean | null;
    linkedCampaignId?: string | null;
  } | null;
}): string {
  const camp = row.campaign;
  if (camp?.visibleToPromoters === false && camp.linkedCampaignId) {
    return camp.linkedCampaignId;
  }
  return camp?.id ?? row.campaignId ?? "unknown";
}

/**
 * Collapse multiple list rows that share the same promoted user on the same
 * public program into one card. Pending invites (no invitee user yet) are
 * never merged. The same promoter on two public campaigns stays as two cards.
 */
export const dedupeReferralsByPromoter = <
  T extends {
    referredUserId?: string | null;
    referredUser?: { id: string } | null;
    campaignId?: string | null;
    campaign?: {
      id?: string | null;
      visibleToPromoters?: boolean | null;
      linkedCampaignId?: string | null;
    } | null;
    preUser?: { currentStep: number } | null;
    level: number;
  },
>(
  rows: T[],
): T[] => {
  const best = new Map<string, T>();
  for (const row of rows) {
    const promoterId = row.referredUser?.id ?? row.referredUserId ?? null;
    if (!promoterId) continue;
    const key = `${promoterId}:${publicCampaignKeyForReferral(row)}`;
    const existing = best.get(key);
    if (!existing || referralDisplayScore(row) > referralDisplayScore(existing)) {
      best.set(key, row);
    }
  }

  const emitted = new Set<string>();
  return rows.filter((row) => {
    const promoterId = row.referredUser?.id ?? row.referredUserId ?? null;
    if (!promoterId) return true;
    const key = `${promoterId}:${publicCampaignKeyForReferral(row)}`;
    if (emitted.has(key)) return false;
    if (best.get(key) !== row) return false;
    emitted.add(key);
    return true;
  });
};

/**
 * Cancel every other ACTIVE "I am the invitee" referral for this promoter on
 * the **same campaign** as the keeper, keeping the canonical row (typically
 * the TeaseMe email-invite that owns the PreUser). Marks superseded rows with
 * `source: am-migration` so they stay out of the Models grid filters.
 *
 * Rows on other campaigns are left alone so a promoter can belong to two
 * companies at once.
 *
 * The keeper is chosen deterministically from ACTIVE rows on that campaign
 * (highest score per `referralDisplayScore`; lowest `id` breaks ties). This
 * prevents a race where two concurrent calls each cancel the other's referral
 * and leave no ACTIVE row — both callers converge on the same winner
 * regardless of which `keepReferralId` they originally supplied.
 */
export async function supersedeDuplicateInviteeReferrals(
  client: Prisma.TransactionClient | PrismaClient,
  args: { keepReferralId: string; promotedUserId: string },
): Promise<number> {
  const keeper = await client.referral.findUnique({
    where: { id: args.keepReferralId },
    select: { id: true, campaignId: true },
  });
  if (!keeper || !keeper.campaignId) return 0;

  // Only ACTIVE rows on the keeper's campaign — membership on another company
  // must not be cancelled as a "duplicate".
  const allActive = await client.referral.findMany({
    where: {
      referredUserId: args.promotedUserId,
      status: "ACTIVE",
      campaignId: keeper.campaignId,
    },
    select: {
      id: true,
      metadata: true,
      level: true,
      preUser: { select: { currentStep: true } },
    },
    orderBy: { id: "asc" },
  });

  if (allActive.length <= 1) return 0;

  const winner = pickCanonicalInviteeReferral(allActive);
  if (!winner) return 0;

  const duplicates = allActive.filter((r: typeof winner) => r.id !== winner.id);

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
          supersededByReferralId: winner.id,
          migratedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    superseded += 1;
  }

  if (superseded > 0) {
    console.info("[supersedeDuplicateInviteeReferrals] cancelled duplicates", {
      keepReferralId: winner.id,
      promotedUserId: args.promotedUserId,
      campaignId: keeper.campaignId,
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

type DbClient = PrismaClient | Prisma.TransactionClient;

export type HiddenMembershipCampaign = {
  id: string;
  name: string;
  linkedCampaignId: string | null;
};

const markReferralAmMigration = async (
  client: DbClient,
  ref: { id: string; metadata: Prisma.JsonValue | null },
  extra: Record<string, unknown> = {},
): Promise<void> => {
  const existing = readReferralMetadataRecord(ref.metadata);
  await client.referral.update({
    where: { id: ref.id },
    data: {
      status: "CANCELLED",
      metadata: {
        ...existing,
        source: "am-migration",
        migratedAt: new Date().toISOString(),
        ...extra,
      } as Prisma.InputJsonValue,
    },
  });
};

/**
 * Sync an account manager's ACTIVE hidden membership referrals to exactly
 * `desiredCampaignIds`. Creates missing rows, cancels unchecked ones, leaves
 * the rest alone. Returns which public linked campaigns were added/removed so
 * callers can enroll or unenroll promoters.
 */
export async function syncAmHiddenMemberships(
  client: DbClient,
  args: {
    amUserId: string;
    desiredCampaignIds: string[];
    referrerId: string;
  },
): Promise<{
  addedLinkedPublicIds: string[];
  removedLinkedPublicIds: string[];
  memberships: HiddenMembershipCampaign[];
}> {
  const desired = Array.from(new Set(args.desiredCampaignIds.filter(Boolean)));

  const campaigns =
    desired.length > 0
      ? await client.campaign.findMany({
          where: { id: { in: desired } },
          select: {
            id: true,
            name: true,
            isActive: true,
            visibleToPromoters: true,
            linkedCampaignId: true,
          },
        })
      : [];

  if (campaigns.length !== desired.length) {
    throw new Error("One or more selected campaigns were not found");
  }
  for (const c of campaigns) {
    if (!c.isActive || c.visibleToPromoters) {
      throw new Error(
        "Selected campaign is not a valid hidden Account Manager campaign",
      );
    }
  }

  const activeReferrals = await client.referral.findMany({
    where: { referredUserId: args.amUserId, status: "ACTIVE" },
    select: {
      id: true,
      campaignId: true,
      referrerId: true,
      metadata: true,
      campaign: {
        select: {
          id: true,
          name: true,
          isActive: true,
          visibleToPromoters: true,
          linkedCampaignId: true,
        },
      },
    },
  });

  const existingHidden = activeReferrals.filter(
    (r) => r.campaign.isActive && !r.campaign.visibleToPromoters,
  );
  const existingByCampaignId = new Map(
    existingHidden.map((r) => [r.campaignId, r]),
  );
  const desiredSet = new Set(desired);

  const removedLinkedPublicIds: string[] = [];
  for (const row of existingHidden) {
    if (desiredSet.has(row.campaignId)) continue;
    await markReferralAmMigration(client, row);
    if (row.campaign.linkedCampaignId) {
      removedLinkedPublicIds.push(row.campaign.linkedCampaignId);
    }
  }

  const addedLinkedPublicIds: string[] = [];
  for (const campaign of campaigns) {
    if (existingByCampaignId.has(campaign.id)) continue;
    const prior = existingHidden[0];
    await client.referral.create({
      data: {
        inviteCode: nanoid(10),
        campaignId: campaign.id,
        referrerId: prior?.referrerId ?? args.referrerId,
        referredUserId: args.amUserId,
        status: "ACTIVE",
        level: 1,
        acceptedAt: new Date(),
      },
    });
    if (campaign.linkedCampaignId) {
      addedLinkedPublicIds.push(campaign.linkedCampaignId);
    }
  }

  return {
    addedLinkedPublicIds: Array.from(new Set(addedLinkedPublicIds)),
    removedLinkedPublicIds: Array.from(new Set(removedLinkedPublicIds)),
    memberships: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      linkedCampaignId: c.linkedCampaignId,
    })),
  };
}

/** Create an ACTIVE invitee referral on a public campaign if one is missing. */
export async function ensurePromoterInviteeOnPublicCampaign(
  client: DbClient,
  args: {
    promoterUserId: string;
    publicCampaignId: string;
    referrerId: string;
    source?: string;
  },
): Promise<boolean> {
  const existing = await client.referral.findFirst({
    where: {
      referredUserId: args.promoterUserId,
      campaignId: args.publicCampaignId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (existing) return false;

  await client.referral.create({
    data: {
      inviteCode: nanoid(10),
      campaignId: args.publicCampaignId,
      referrerId: args.referrerId,
      referredUserId: args.promoterUserId,
      status: "ACTIVE",
      level: 1,
      acceptedAt: new Date(),
      metadata: {
        source: args.source ?? "am-multi-campaign-enroll",
        assignedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
  return true;
}

/** Cancel ACTIVE invitee referrals for a promoter on a specific public campaign. */
export async function cancelPromoterInviteeOnPublicCampaign(
  client: DbClient,
  args: { promoterUserId: string; publicCampaignId: string },
): Promise<number> {
  const rows = await client.referral.findMany({
    where: {
      referredUserId: args.promoterUserId,
      campaignId: args.publicCampaignId,
      status: "ACTIVE",
    },
    select: { id: true, metadata: true },
  });
  for (const row of rows) {
    await markReferralAmMigration(client, row, {
      reason: "am-campaign-removed",
    });
  }
  return rows.length;
}

/**
 * Enroll every promoter/team-manager owned by the AM onto the given public
 * campaigns (skipping rows that already exist).
 */
export async function enrollAmPromotersOnPublicCampaigns(
  client: DbClient,
  args: {
    amUserId: string;
    publicCampaignIds: string[];
  },
): Promise<void> {
  const publicIds = Array.from(new Set(args.publicCampaignIds.filter(Boolean)));
  if (publicIds.length === 0) return;

  const promoters = await client.user.findMany({
    where: {
      accountManagerId: args.amUserId,
      isActive: true,
      userType: { in: ["PROMOTER", "TEAM_MANAGER"] },
    },
    select: { id: true },
  });

  for (const promoter of promoters) {
    for (const publicCampaignId of publicIds) {
      await ensurePromoterInviteeOnPublicCampaign(client, {
        promoterUserId: promoter.id,
        publicCampaignId,
        referrerId: args.amUserId,
        source: "am-campaign-added",
      });
    }
  }
}

/**
 * Cancel promoters' ACTIVE invitee rows on public campaigns the AM left.
 */
export async function unenrollAmPromotersFromPublicCampaigns(
  client: DbClient,
  args: {
    amUserId: string;
    publicCampaignIds: string[];
  },
): Promise<void> {
  const publicIds = Array.from(new Set(args.publicCampaignIds.filter(Boolean)));
  if (publicIds.length === 0) return;

  const promoters = await client.user.findMany({
    where: {
      accountManagerId: args.amUserId,
      userType: { in: ["PROMOTER", "TEAM_MANAGER"] },
    },
    select: { id: true },
  });

  for (const promoter of promoters) {
    for (const publicCampaignId of publicIds) {
      await cancelPromoterInviteeOnPublicCampaign(client, {
        promoterUserId: promoter.id,
        publicCampaignId,
      });
    }
  }
}

/**
 * Sync a dragged promoter onto every linked public campaign of their new AM,
 * and cancel ACTIVE invitee rows on campaigns that AM is not enrolled in.
 */
export async function syncPromoterToAmLinkedCampaigns(
  client: DbClient,
  args: {
    promoterUserId: string;
    amUserId: string;
    linkedPublicCampaignIds: string[];
  },
): Promise<void> {
  const targetIds = Array.from(
    new Set(args.linkedPublicCampaignIds.filter(Boolean)),
  );
  const targetSet = new Set(targetIds);

  const activeInvitee = await client.referral.findMany({
    where: {
      referredUserId: args.promoterUserId,
      status: "ACTIVE",
      campaign: { visibleToPromoters: true },
    },
    select: { id: true, campaignId: true, metadata: true },
  });

  for (const row of activeInvitee) {
    if (targetSet.has(row.campaignId)) continue;
    await markReferralAmMigration(client, row, {
      reason: "am-assign-campaign-sync",
    });
  }

  for (const publicCampaignId of targetIds) {
    await ensurePromoterInviteeOnPublicCampaign(client, {
      promoterUserId: args.promoterUserId,
      publicCampaignId,
      referrerId: args.amUserId,
      source: "manual-am-assign",
    });
  }
}
