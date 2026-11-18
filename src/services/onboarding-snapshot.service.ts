/**
 * Product onboarding snapshot cached on Referral.
 *
 * TeaseMe and Sugar Scratch own pre-user / pre-influencer state. MJ Promoter
 * only keeps a short-lived read cache on the Referral so promoter cards and
 * webhooks stay responsive. This is not a PreUser entity.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

export type OnboardingSnapshot = {
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
  currentStep: 0,
  status: "pending",
  surveyLink: null,
  assetLink: null,
  teasemeUserId: null,
  stepHistory: null,
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
): OnboardingSnapshot => ({
  ...DEFAULT_SNAPSHOT,
  surveyLink,
});

export const toOnboardingView = (
  referral: ReferralOnboardingFields,
): OnboardingView => {
  const snap = readOnboardingSnapshot(referral.onboarding);
  return {
    id: referral.id,
    email: inviteeEmailFromMetadata(referral.metadata),
    referralId: referral.id,
    inviteCode: referral.inviteCode,
    lastCheckedAt: referral.onboardingCheckedAt,
    welcomeEmailSentAt: referral.welcomeEmailSentAt,
    ...snap,
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
    currentStep: snap.currentStep,
    status: snap.status,
    surveyLink: snap.surveyLink,
    assetLink: snap.assetLink,
    teasemeUserId: snap.teasemeUserId,
    stepHistory: snap.stepHistory,
  }) as Prisma.InputJsonValue;

export type OnboardingPatch = Partial<{
  currentStep: number;
  status: string;
  surveyLink: string | null;
  assetLink: string | null;
  teasemeUserId: string | null;
  stepHistory: Prisma.JsonValue | null;
  lastCheckedAt: Date | null;
  welcomeEmailSentAt: Date | null;
}>;

/**
 * Merge a product refresh into Referral.onboarding (+ optional welcome stamp).
 * Returns the OnboardingView after write.
 */
export const patchReferralOnboarding = async (
  prisma: PrismaClient,
  referralId: string,
  patch: OnboardingPatch,
): Promise<OnboardingView> => {
  const current = await prisma.referral.findUnique({
    where: { id: referralId },
    select: referralOnboardingSelect,
  });
  if (!current) {
    throw new Error(`Referral ${referralId} not found for onboarding patch`);
  }

  const snap = readOnboardingSnapshot(current.onboarding);
  const next: OnboardingSnapshot = {
    currentStep:
      typeof patch.currentStep === "number"
        ? patch.currentStep
        : snap.currentStep,
    status: typeof patch.status === "string" ? patch.status : snap.status,
    surveyLink:
      patch.surveyLink !== undefined ? patch.surveyLink : snap.surveyLink,
    assetLink:
      patch.assetLink !== undefined ? patch.assetLink : snap.assetLink,
    teasemeUserId:
      patch.teasemeUserId !== undefined
        ? patch.teasemeUserId
        : snap.teasemeUserId,
    stepHistory:
      patch.stepHistory !== undefined ? patch.stepHistory : snap.stepHistory,
  };

  const data: Prisma.ReferralUpdateInput = {
    onboarding: onboardingToJson(next),
  };
  if (patch.lastCheckedAt !== undefined) {
    data.onboardingCheckedAt = patch.lastCheckedAt;
  }
  if (patch.welcomeEmailSentAt !== undefined) {
    data.welcomeEmailSentAt = patch.welcomeEmailSentAt;
  }

  const updated = await prisma.referral.update({
    where: { id: referralId },
    data,
    select: referralOnboardingSelect,
  });
  return toOnboardingView(updated);
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
