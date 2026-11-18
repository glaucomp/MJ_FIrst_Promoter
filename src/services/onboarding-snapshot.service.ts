/**
 * Product onboarding snapshot cached on Referral.
 *
 * TeaseMe and Sugar Scratch own pre-user / pre-influencer state. MJ Promoter
 * only keeps a short-lived read cache on the Referral so promoter cards and
 * webhooks stay responsive. This is not a PreUser entity.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

export type OnboardingSnapshot = {
  /** Invitee email — durable after pre_users drop (legacy rows may lack metadata.inviteeEmail). */
  email: string | null;
  currentStep: number;
  status: string;
  surveyLink: string | null;
  assetLink: string | null;
  teasemeUserId: string | null;
  stepHistory: Prisma.JsonValue | null;
};

/** API / UI shape previously backed by the PreUser table. */
export type OnboardingView = OnboardingSnapshot & {
  /** Same as referral id — kept for callers that keyed promote on preUser.id. */
  id: string;
  email: string;
  referralId: string;
  inviteCode: string | null;
  lastCheckedAt: Date | null;
  welcomeEmailSentAt: Date | null;
};

export type ReferralOnboardingFields = {
  id: string;
  inviteCode: string;
  welcomeEmailSentAt: Date | null;
  onboarding: Prisma.JsonValue | null;
  onboardingCheckedAt: Date | null;
  metadata?: Prisma.JsonValue | null;
};

const DEFAULT_SNAPSHOT: OnboardingSnapshot = {
  email: null,
  currentStep: 0,
  status: "pending",
  surveyLink: null,
  assetLink: null,
  teasemeUserId: null,
  stepHistory: null,
};

/** Trim + validate only — keep invite/product casing for upstream lookups. */
const preserveEmail = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const email = raw.trim();
  return email.includes("@") ? email : null;
};

/** Case-insensitive equality for matching invites to User / webhook bodies. */
export const emailsEqual = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean => {
  const left = typeof a === "string" ? a.trim().toLowerCase() : "";
  const right = typeof b === "string" ? b.trim().toLowerCase() : "";
  return left.length > 0 && left === right;
};

export const readReferralMetadataRecord = (
  raw: Prisma.JsonValue | null | undefined,
): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
};

/** Original invitee email from metadata (casing preserved). Empty if missing. */
export const inviteeEmailFromMetadata = (
  metadata: Prisma.JsonValue | null | undefined,
): string => {
  return preserveEmail(readReferralMetadataRecord(metadata).inviteeEmail) ?? "";
};

export const readOnboardingSnapshot = (
  raw: Prisma.JsonValue | null | undefined,
): OnboardingSnapshot => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_SNAPSHOT };
  }
  const o = raw as Record<string, unknown>;
  const step =
    typeof o.currentStep === "number" && Number.isFinite(o.currentStep)
      ? Math.trunc(o.currentStep)
      : 0;
  return {
    email: preserveEmail(o.email),
    currentStep: Math.max(0, step),
    status: typeof o.status === "string" && o.status ? o.status : "pending",
    surveyLink: typeof o.surveyLink === "string" ? o.surveyLink : null,
    assetLink: typeof o.assetLink === "string" ? o.assetLink : null,
    teasemeUserId:
      typeof o.teasemeUserId === "string" ? o.teasemeUserId : null,
    stepHistory:
      o.stepHistory === null || o.stepHistory === undefined
        ? null
        : (o.stepHistory as Prisma.JsonValue),
  };
};

export const seedOnboardingSnapshot = (
  surveyLink: string | null,
  email?: string | null,
): OnboardingSnapshot => ({
  ...DEFAULT_SNAPSHOT,
  email: preserveEmail(email),
  surveyLink,
});

export const toOnboardingView = (
  referral: ReferralOnboardingFields,
): OnboardingView => {
  const snap = readOnboardingSnapshot(referral.onboarding);
  // Prefer durable onboarding.email (migrated from pre_users / seeded on
  // invite), preserving original casing for Sugar/TeaseMe + User lookups.
  // Fall back to metadata.inviteeEmail when the snapshot has no email.
  const email =
    snap.email || inviteeEmailFromMetadata(referral.metadata) || "";
  return {
    ...snap,
    id: referral.id,
    email,
    referralId: referral.id,
    inviteCode: referral.inviteCode,
    lastCheckedAt: referral.onboardingCheckedAt,
    welcomeEmailSentAt: referral.welcomeEmailSentAt,
  };
};

/** Prisma include/select fragment used wherever list handlers used `preUser`. */
export const referralOnboardingSelect = {
  id: true,
  inviteCode: true,
  welcomeEmailSentAt: true,
  onboarding: true,
  onboardingCheckedAt: true,
  metadata: true,
} as const;

export const onboardingToJson = (
  snap: OnboardingSnapshot,
): Prisma.InputJsonValue =>
  ({
    email: snap.email,
    currentStep: snap.currentStep,
    status: snap.status,
    surveyLink: snap.surveyLink,
    assetLink: snap.assetLink,
    teasemeUserId: snap.teasemeUserId,
    stepHistory: snap.stepHistory,
  }) as Prisma.InputJsonValue;

export type OnboardingPatch = Partial<{
  email: string | null;
  currentStep: number;
  status: string;
  surveyLink: string | null;
  assetLink: string | null;
  teasemeUserId: string | null;
  stepHistory: Prisma.JsonValue | null;
  lastCheckedAt: Date | null;
  welcomeEmailSentAt: Date | null;
  /**
   * Allow currentStep to decrease (Sugar pack-not-ready 2→1). Ignored once
   * the snapshot is already live/published so a stale writer cannot unwind LP.
   */
  allowStepRewind: boolean;
}>;

const ONBOARDING_PATCH_MAX_RETRIES = 5;

const PUBLISHED_SURVEY_STEP = (() => {
  const raw = Number(
    process.env.TEASEME_PUBLISHED_SURVEY_STEP ??
      process.env.MJ_PROMOTER_PUBLISHED_SURVEY_STEP,
  );
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : 5;
})();

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  order_lp: 1,
  approved: 2,
  building: 2,
  live: 3,
};

const canonicalizeOnboardingStatus = (status: string): string =>
  status === "confirmed" ? "order_lp" : status;

/** Forward-only status merge — never downgrade on concurrent retry. */
export const chooseForwardOnboardingStatus = (
  current: string,
  upstream: string | null | undefined,
): string => {
  if (!upstream) return canonicalizeOnboardingStatus(current);
  const nextUpstream = canonicalizeOnboardingStatus(upstream);
  if (nextUpstream === current || upstream === current) {
    return canonicalizeOnboardingStatus(current);
  }
  const cur = STATUS_RANK[current] ?? Number.POSITIVE_INFINITY;
  const ups = STATUS_RANK[upstream] ?? Number.POSITIVE_INFINITY;
  return canonicalizeOnboardingStatus(ups >= cur ? upstream : current);
};

const isPublishedSnapshot = (snap: OnboardingSnapshot): boolean =>
  snap.status === "live" || snap.currentStep >= PUBLISHED_SURVEY_STEP;

const referralOnboardingLockSelect = {
  ...referralOnboardingSelect,
  updatedAt: true,
} as const;

/**
 * Merge a patch onto the latest snapshot.
 * On optimistic retry the patch may be stale — step/status only move forward
 * (unless allowStepRewind before published), and links/email are never cleared.
 */
export const mergeOnboardingPatch = (
  snap: OnboardingSnapshot,
  patch: OnboardingPatch,
  metadataEmail: string | null,
): OnboardingSnapshot => {
  let currentStep = snap.currentStep;
  if (typeof patch.currentStep === "number") {
    const canRewind =
      patch.allowStepRewind === true && !isPublishedSnapshot(snap);
    currentStep = canRewind
      ? patch.currentStep
      : Math.max(snap.currentStep, patch.currentStep);
  }

  const status =
    patch.status !== undefined
      ? chooseForwardOnboardingStatus(snap.status, patch.status)
      : snap.status;

  const preferLink = (
    patched: string | null | undefined,
    existing: string | null,
  ): string | null => {
    if (patched === undefined) return existing;
    // Never null out a link a concurrent writer just stored.
    return patched || existing;
  };

  const stepAdvancedOrRewound =
    typeof patch.currentStep === "number" &&
    (currentStep !== snap.currentStep || patch.allowStepRewind === true);

  return {
    email:
      patch.email !== undefined
        ? preserveEmail(patch.email) || snap.email || metadataEmail || null
        : snap.email || metadataEmail || null,
    currentStep,
    status,
    surveyLink: preferLink(patch.surveyLink, snap.surveyLink),
    assetLink: preferLink(patch.assetLink, snap.assetLink),
    teasemeUserId:
      patch.teasemeUserId !== undefined
        ? patch.teasemeUserId || snap.teasemeUserId
        : snap.teasemeUserId,
    stepHistory:
      patch.stepHistory !== undefined && stepAdvancedOrRewound
        ? patch.stepHistory
        : patch.stepHistory !== undefined && currentStep >= snap.currentStep
          ? patch.stepHistory
          : snap.stepHistory,
  };
};

/**
 * Merge a product refresh into Referral.onboarding (+ optional welcome stamp).
 * Optimistic lock on `updatedAt`; each retry re-merges onto the freshest row
 * with forward-only semantics so a slow poll cannot unwind a newer webhook.
 */
export const patchReferralOnboarding = async (
  prisma: PrismaClient,
  referralId: string,
  patch: OnboardingPatch,
): Promise<OnboardingView> => {
  for (let attempt = 0; attempt < ONBOARDING_PATCH_MAX_RETRIES; attempt++) {
    const current = await prisma.referral.findUnique({
      where: { id: referralId },
      select: referralOnboardingLockSelect,
    });
    if (!current) {
      throw new Error(`Referral ${referralId} not found for onboarding patch`);
    }

    const snap = readOnboardingSnapshot(current.onboarding);
    const metaEmail = inviteeEmailFromMetadata(current.metadata) || null;
    const next = mergeOnboardingPatch(snap, patch, metaEmail);

    const data: Prisma.ReferralUpdateManyMutationInput = {
      onboarding: onboardingToJson(next),
    };
    if (patch.lastCheckedAt !== undefined) {
      data.onboardingCheckedAt = patch.lastCheckedAt;
    }
    if (patch.welcomeEmailSentAt !== undefined) {
      data.welcomeEmailSentAt = patch.welcomeEmailSentAt;
    }

    const claimed = await prisma.referral.updateMany({
      where: { id: referralId, updatedAt: current.updatedAt },
      data,
    });
    if (claimed.count === 1) {
      const updated = await prisma.referral.findUniqueOrThrow({
        where: { id: referralId },
        select: referralOnboardingSelect,
      });
      return toOnboardingView(updated);
    }
  }

  throw new Error(
    `Referral ${referralId} onboarding patch failed after ${ONBOARDING_PATCH_MAX_RETRIES} concurrent retries`,
  );
};

/** Clear product cache after the invitee becomes a real User (TeaseMe register). */
export const clearReferralOnboarding = async (
  prisma: PrismaClient,
  referralId: string,
): Promise<void> => {
  await prisma.referral.update({
    where: { id: referralId },
    data: {
      onboarding: Prisma.DbNull,
      onboardingCheckedAt: null,
    },
  });
};

/**
 * Case-insensitive invitee lookup for webhooks that omit inviteCode.
 * Matches metadata.inviteeEmail or onboarding.email. Prefers open PENDING
 * invites (no referred user), then newest createdAt.
 */
export const findReferralIdByInviteeEmail = async (
  prisma: PrismaClient,
  email: string,
): Promise<string | null> => {
  const needle = preserveEmail(email);
  if (!needle) return null;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT r.id
    FROM referrals r
    WHERE (
      LOWER(TRIM(COALESCE(r.metadata->>'inviteeEmail', ''))) = LOWER(TRIM(${needle}))
      OR LOWER(TRIM(COALESCE(r.onboarding->>'email', ''))) = LOWER(TRIM(${needle}))
    )
    ORDER BY
      CASE
        WHEN r.status = 'PENDING' AND r."referredUserId" IS NULL THEN 0
        ELSE 1
      END ASC,
      r."createdAt" DESC
    LIMIT 1
  `);
  return rows[0]?.id ?? null;
};
