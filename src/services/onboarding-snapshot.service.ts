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

const normalizeEmail = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.includes("@") ? email : null;
};

export const readReferralMetadataRecord = (
  raw: Prisma.JsonValue | null | undefined,
): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
};

export const inviteeEmailFromMetadata = (
  metadata: Prisma.JsonValue | null | undefined,
): string => {
  const email = readReferralMetadataRecord(metadata).inviteeEmail;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
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
    email: normalizeEmail(o.email),
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
  email: normalizeEmail(email),
  surveyLink,
});

export const toOnboardingView = (
  referral: ReferralOnboardingFields,
): OnboardingView => {
  const snap = readOnboardingSnapshot(referral.onboarding);
  // Prefer the durable onboarding.email (migrated from pre_users / seeded on
  // invite). Fall back to metadata.inviteeEmail for rows that only have it there.
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
}>;

const ONBOARDING_PATCH_MAX_RETRIES = 5;

const referralOnboardingLockSelect = {
  ...referralOnboardingSelect,
  updatedAt: true,
} as const;

/** Apply a patch onto the latest snapshot. Patch fields win; omitted fields keep. */
export const mergeOnboardingPatch = (
  snap: OnboardingSnapshot,
  patch: OnboardingPatch,
  metadataEmail: string | null,
): OnboardingSnapshot => ({
  // Never drop a known invitee email on a product refresh that omits it.
  email:
    patch.email !== undefined
      ? normalizeEmail(patch.email)
      : snap.email || metadataEmail || null,
  currentStep:
    typeof patch.currentStep === "number" ? patch.currentStep : snap.currentStep,
  status: typeof patch.status === "string" ? patch.status : snap.status,
  surveyLink:
    patch.surveyLink !== undefined ? patch.surveyLink : snap.surveyLink,
  assetLink: patch.assetLink !== undefined ? patch.assetLink : snap.assetLink,
  teasemeUserId:
    patch.teasemeUserId !== undefined
      ? patch.teasemeUserId
      : snap.teasemeUserId,
  stepHistory:
    patch.stepHistory !== undefined ? patch.stepHistory : snap.stepHistory,
});

/**
 * Merge a product refresh into Referral.onboarding (+ optional welcome stamp).
 * Uses optimistic locking on `updatedAt` and re-merges on conflict so two
 * concurrent writers (e.g. Sugar webhook assetLink + order-LP step bump)
 * cannot replace the whole JSON and discard each other's fields.
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
