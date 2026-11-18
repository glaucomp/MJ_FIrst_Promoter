import { Prisma, PrismaClient, UserRole, UserType } from "@prisma/client";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { nanoid } from "nanoid";
import { timingSafeEqual } from "node:crypto";
import { stepEmitter } from "../lib/step-emitter";
import { AuthRequest } from "../middleware/auth.middleware";
import { emailService, outboundFromAddress } from "../services/email.service";
import {
  inviteMailCampaignSelect,
  inviteMailFallbackSelect,
  pickInviteMail,
} from "../services/invite-mail.service";
import { promotePreUserToUser, resolveOwnership } from "../services/pre-user-promote.service";
import {
  findReferralIdByInviteeEmail,
  onboardingToJson,
  patchReferralOnboarding,
  readOnboardingSnapshot,
  referralOnboardingSelect,
  seedOnboardingSnapshot,
  toOnboardingView,
  type OnboardingView,
} from "../services/onboarding-snapshot.service";
import {
  dedupeReferralsByPromoter,
  findMembershipReferralForPublicCampaign,
  isUserParticipantOnCampaign,
  referralDisplayScore,
  supersedeDuplicateInviteeReferrals,
} from "../services/referral-membership.service";
import { getPresignedUrl } from "../services/s3.service";
import { resolveAccountManagersFor } from "../services/ownership.service";
import {
  getSugarPackageWorkspace,
  isSugarScratchCampaign,
  makeSugarPackage,
  normalizeCampaignLandingUrl,
  orderSugarLandingPage,
} from "../services/sugar.service";
import {
  approvePreInfluencer,
  denyPreInfluencer,
  fetchTeasemePreUserStatus,
  notifyChattersAssigned,
  reassignPreInfluencer,
} from "../services/teaseme.service";

const prisma = new PrismaClient();

// Pending invites expire 24h after the most recent send. Clicking "Resend"
// rebuilds the email and pushes the expiry forward by another 24h; the
// status in the DB stays `PENDING` throughout — expiry is a computed flag
// exposed to the UI, not a persisted enum value.
const REFERRAL_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

// How long a PreUser's TeaseMe-derived lifecycle data is considered fresh
// before the next My Promoters load re-polls tmapi. 5 min default keeps the
// chip close to real-time without hammering upstream on every list render.
const TEASEME_POLL_TTL_MS = (() => {
  const raw = Number(process.env.TEASEME_POLL_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5 * 60 * 1000;
})();

// Cap simultaneous upstream calls so a large invite list doesn't fan out into
// dozens of parallel tmapi requests.
const TEASEME_POLL_CONCURRENCY = 5;

// PreUser.status follows a strictly forward lifecycle: `pending → order_lp →
// building → live`. Each rank below increases monotonically along that path.
// Anything we don't recognize (legacy values, future additions) gets rank
// `Infinity` so the *first* time we see an unknown status we trust upstream;
// once it's on disk, only an equally-or-more advanced status can replace it.
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  // Sugar Scratchie confirm (email/name) — same chip window as order_lp.
  // Persisted as order_lp so the card does not depend on currentStep.
  confirmed: 1,
  order_lp: 1,
  // TeaseMe returns `approved` immediately after /approve — same lifecycle
  // position as our mirrored `building` state.
  approved: 2,
  building: 2,
  live: 3,
};

// Collapse aliases onto the status the card renders. `confirmed` is the
// Sugar confirm webhook; it shares the Order LP window with `order_lp`.
const canonicalizePreUserStatus = (status: string): string =>
  status === "confirmed" ? "order_lp" : status;

// Terminal survey_step when the LP is fully published upstream (stop polling,
// auto-accept referral, welcome-email eligibility). This is NOT the same as
// onboarding 3/3 — that milestone is ~3 and should surface "Order Landing
// Page", not skip straight to LP Live. Legacy flows used step 5.
const PUBLISHED_SURVEY_STEP = (() => {
  const raw = Number(
    process.env.TEASEME_PUBLISHED_SURVEY_STEP ??
      process.env.MJ_PROMOTER_PUBLISHED_SURVEY_STEP,
  );
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : 5;
})();

/**
 * Resolve the next persisted status given (a) what we already have on disk
 * and (b) what an upstream poll just told us. Used to defend against stale
 * `/step-progress` responses that haven't yet learned about a more recent
 * `/approve` we made on this invite — without this, the next list render
 * could downgrade `building` back to `pending`, blowing away the AM's click.
 *
 * Rules:
 *   - upstream null/empty → keep current.
 *   - upstream rank ≥ current rank → adopt upstream (forward transition).
 *   - upstream rank < current rank → ignore upstream, keep current.
 *   - either side unranked (unknown enum) → treat its rank as Infinity, so
 *     unknown values are accepted on disk but won't be overwritten by a
 *     downgrade. This keeps us forward-compatible with new lifecycle values
 *     TeaseMe might add later.
 */
const chooseForwardStatus = (
  current: string,
  upstream: string | null | undefined,
): string => {
  if (!upstream) return canonicalizePreUserStatus(current);
  const nextUpstream = canonicalizePreUserStatus(upstream);
  if (nextUpstream === current || upstream === current) {
    return canonicalizePreUserStatus(current);
  }
  const cur = STATUS_RANK[current] ?? Number.POSITIVE_INFINITY;
  const ups = STATUS_RANK[upstream] ?? Number.POSITIVE_INFINITY;
  return canonicalizePreUserStatus(ups >= cur ? upstream : current);
};

const isPreUserPublished = (
  currentStep: number,
  status: string | null | undefined,
): boolean => status === "live" || currentStep >= PUBLISHED_SURVEY_STEP;

// Keep the audit trail from unbounded growth — a single invite should never
// accumulate more than this many step transitions in the stepHistory column.
const STEP_HISTORY_MAX = 20;

type StepHistoryEntry = { step: number; at: string };

const readStepHistory = (
  raw: Prisma.JsonValue | null | undefined,
): StepHistoryEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StepHistoryEntry =>
      !!e &&
      typeof e === "object" &&
      !Array.isArray(e) &&
      typeof (e as StepHistoryEntry).step === "number" &&
      typeof (e as StepHistoryEntry).at === "string",
  );
};

/** Product onboarding snapshot view (formerly PreUser row). */
type PreUserRow = OnboardingView;

const attachOnboardingView = <T extends {
  id: string;
  inviteCode: string;
  welcomeEmailSentAt: Date | null;
  onboarding: Prisma.JsonValue | null;
  onboardingCheckedAt: Date | null;
  metadata?: Prisma.JsonValue | null;
}>(
  row: T,
): T & { preUser: PreUserRow | null } => ({
  ...row,
  preUser:
    row.onboarding != null || row.welcomeEmailSentAt != null
      ? toOnboardingView(row)
      : null,
});

type ReferralRowWithPreUser = {
  preUser: PreUserRow | null;
  // Present on getMyReferrals rows. Sugar Scratchie campaigns never poll
  // TeaseMe — the two products share only MJ Promoter, not each other.
  campaign?: { name?: string | null } | null;
};

type PendingPublishedReferralBackfillRow = {
  id: string;
  status: string;
  referredUser: { id: string } | null;
  preUser: PreUserRow | null;
};

const pendingReferralBackfillByUser = new Set<string>();
const duplicateInviteeRepairByUser = new Set<string>();

/**
 * For each referral in `rows`, check whether the attached PreUser's
 * TeaseMe-derived state is stale (TTL elapsed) and, if so, re-poll tmapi.
 * Mutates each `rows[i].preUser` in-place so the caller's response payload
 * reflects the freshly-written DB state without a second read. Bounded
 * concurrency keeps a fan-out spike from overwhelming the upstream.
 *
 * Never flips `Referral.status` — that transition is owned exclusively by
 * the register handler, which deletes the PreUser on successful signup.
 */
const refreshPreUserSteps = async (
  rows: ReferralRowWithPreUser[],
): Promise<void> => {
  const now = Date.now();
  const staleRows = rows.filter((row) => {
    const pre = row.preUser;
    if (!pre) return false;
    // Sugar Scratchie pushes steps via teaseme-step webhooks only. Polling
    // TeaseMe for those rows can overwrite Sugar assetLink / step state.
    if (isSugarScratchCampaign(row.campaign?.name)) return false;
    // Published/live is the terminal upstream state — once we've recorded it
    // locally there is nothing left to learn from /step-progress.
    // Welcome-email delivery is an operator action driven by the "Send Welcome
    // Email" button on the card, not a polling side-effect, so we stop polling
    // as soon as the invite is published even if the upstream step numbering
    // changes later.
    if (isPreUserPublished(pre.currentStep, pre.status)) return false;
    if (!pre.lastCheckedAt) return true;
    return now - pre.lastCheckedAt.getTime() > TEASEME_POLL_TTL_MS;
  });

  if (staleRows.length === 0) return;

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(TEASEME_POLL_CONCURRENCY, staleRows.length) },
    async () => {
      while (cursor < staleRows.length) {
        const idx = cursor++;
        const row = staleRows[idx];
        const pre = row.preUser!;
        try {
          const status = await fetchTeasemePreUserStatus({
            email: pre.email,
            inviteCode: pre.inviteCode ?? undefined,
          });
          const nextCheckedAt = new Date();
          if (!status) {
            // Upstream miss / error — just bump onboardingCheckedAt so we don't
            // spin on the same row every list render.
            const updated = await patchReferralOnboarding(prisma, pre.id, {
              lastCheckedAt: nextCheckedAt,
            });
            row.preUser = updated;
            continue;
          }

          const history = readStepHistory(pre.stepHistory);
          const nextHistory =
            status.step > pre.currentStep
              ? [
                  ...history,
                  { step: status.step, at: nextCheckedAt.toISOString() },
                ].slice(-STEP_HISTORY_MAX)
              : history;

          const updated = await patchReferralOnboarding(prisma, pre.id, {
            // Always advance monotonically so a stale upstream poll can
            // never flip a card backward in the UI. `orderReferralLandingPage`
            // applies the same rule.
            currentStep: Math.max(pre.currentStep, status.step),
            // Cache TeaseMe's lifecycle string so the list endpoint can emit
            // it without a second upstream call. chooseForwardStatus() guards
            // against stale `/step-progress` responses that would otherwise
            // downgrade a row we just promoted via `/approve`.
            status: chooseForwardStatus(pre.status, status.status),
            teasemeUserId: status.teasemeUserId ?? pre.teasemeUserId,
            surveyLink:
              (status.surveyLink && !status.surveyLink.includes("inviteCode=")
                ? status.surveyLink
                : null) ?? pre.surveyLink,
            assetLink: status.assetLink ?? pre.assetLink,
            lastCheckedAt: nextCheckedAt,
            stepHistory: nextHistory as unknown as Prisma.JsonValue,
          });
          row.preUser = updated;

          // If the step or either link changed, push an SSE event so any
          // open browser tab refetches the card without a manual reload.
          const stepChanged = updated.currentStep !== pre.currentStep;
          const assetLinkChanged = updated.assetLink !== pre.assetLink;
          const surveyLinkChanged = updated.surveyLink !== pre.surveyLink;
          const statusChanged = updated.status !== pre.status;
          if (
            stepChanged ||
            assetLinkChanged ||
            surveyLinkChanged ||
            statusChanged
          ) {
            stepEmitter.emit(`step:${updated.referralId}`, {
              currentStep: updated.currentStep,
              status: updated.status,
              done: isPreUserPublished(updated.currentStep, updated.status),
            });
          }

          // Note: promoting the PreUser to a real User + sending the
          // welcome email is no longer an automatic side-effect of the
          // 4→5 transition. That work is now driven explicitly by the
          // AM clicking "Send Welcome Email" / "Resend Welcome Email" on
          // the LP Live card (see sendReferralWelcomeEmail below).
        } catch (err) {
          console.error("[refreshPreUserSteps] poll failed", {
            preUserId: pre.id,
            err: (err as Error).message,
          });
        }
      }
    },
  );

  await Promise.allSettled(workers);
};

const backfillPendingPublishedReferrals = (
  userId: string,
  rows: PendingPublishedReferralBackfillRow[],
): void => {
  if (pendingReferralBackfillByUser.has(userId)) return;

  const pendingPublished = rows.filter(
    (ref): ref is PendingPublishedReferralBackfillRow & { preUser: PreUserRow } =>
      ref.status === "PENDING" &&
      ref.referredUser === null &&
      ref.preUser !== null &&
      isPreUserPublished(ref.preUser.currentStep, ref.preUser.status),
  );

  if (pendingPublished.length === 0) return;

  pendingReferralBackfillByUser.add(userId);

  void (async () => {
    try {
      const inviteEmails = pendingPublished
        .map((ref) => ref.preUser.email)
        .filter(Boolean);
      const existingUsers = await prisma.user.findMany({
        where: {
          OR: inviteEmails.map((email) => ({
            email: { equals: email, mode: "insensitive" as const },
          })),
        },
        select: { id: true, email: true },
      });
      const userIdByEmail = new Map(
        existingUsers.map((row) => [row.email.trim().toLowerCase(), row.id]),
      );

      for (const ref of pendingPublished) {
        const existingUserId = userIdByEmail.get(
          ref.preUser.email.trim().toLowerCase(),
        );
        if (!existingUserId) continue;

        try {
          const accepted = await prisma.referral.updateMany({
            where: { id: ref.id, status: "PENDING" },
            data: {
              referredUserId: existingUserId,
              status: "ACTIVE",
              acceptedAt: new Date(),
            },
          });
          if (accepted.count > 0) {
            console.info("[getMyReferrals] backfill: referral accepted on published state", {
              referralId: ref.id, userId: existingUserId,
            });
            await supersedeDuplicateInviteeReferrals(prisma, {
              keepReferralId: ref.id,
              promotedUserId: existingUserId,
            });
          }
        } catch (err) {
          console.error("[getMyReferrals] backfill (pending published invite) failed", {
            referralId: ref.id, err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      console.error("[getMyReferrals] backfill outer error", err);
    } finally {
      pendingReferralBackfillByUser.delete(userId);
    }
  })();
};

type DuplicateInviteeRepairRow = {
  id: string;
  referredUserId: string | null;
  status: string;
  level: number;
  campaignId?: string | null;
  campaign?: {
    id?: string | null;
    visibleToPromoters?: boolean | null;
    linkedCampaignId?: string | null;
  } | null;
  onboarding?: Prisma.JsonValue | null;
  preUser: { currentStep: number } | null;
};

/** Repair existing production duplicates (same promoter + same campaign). */
const repairDuplicateInviteeReferrals = (
  userId: string,
  rows: DuplicateInviteeRepairRow[],
): void => {
  if (duplicateInviteeRepairByUser.has(userId)) return;

  // Group by promoter + public campaign so two companies stay as two ACTIVE
  // rows while true duplicates on one program still collapse.
  const byInviteeCampaign = new Map<string, DuplicateInviteeRepairRow[]>();
  for (const row of rows) {
    if (row.status !== "ACTIVE" || !row.referredUserId) continue;
    const publicKey =
      row.campaign?.visibleToPromoters === false && row.campaign.linkedCampaignId
        ? row.campaign.linkedCampaignId
        : row.campaign?.id ?? row.campaignId ?? "unknown";
    const key = `${row.referredUserId}:${publicKey}`;
    const group = byInviteeCampaign.get(key) ?? [];
    group.push(row);
    byInviteeCampaign.set(key, group);
  }

  const repairs: Array<{ keepReferralId: string; promotedUserId: string }> = [];
  for (const group of byInviteeCampaign.values()) {
    if (group.length <= 1) continue;
    const winner = group.reduce((best, row) =>
      referralDisplayScore(row) > referralDisplayScore(best) ? row : best,
    );
    if (!winner.referredUserId) continue;
    repairs.push({
      keepReferralId: winner.id,
      promotedUserId: winner.referredUserId,
    });
  }

  if (repairs.length === 0) return;

  duplicateInviteeRepairByUser.add(userId);
  void (async () => {
    try {
      for (const repair of repairs) {
        try {
          await supersedeDuplicateInviteeReferrals(prisma, repair);
        } catch (err) {
          console.error("[getMyReferrals] duplicate invitee repair failed", {
            ...repair,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      duplicateInviteeRepairByUser.delete(userId);
    }
  })();
};

const hasAccountManagerAccess = (user: AuthRequest["user"]) => {
  return user?.userType === UserType.ACCOUNT_MANAGER;
};

// Referral.metadata is typed as Prisma.JsonValue. Narrow it to the shape we
// actually write so callers can read `inviteeEmail` / `expiresAt` / etc
// without repeating the type guard everywhere.
//
// AM-line vs promoter-line (for analytics / pending reports only):
// - When the inviter is ADMIN or ACCOUNT_MANAGER, `accountManagerEmail` is set
//   to the same value as `inviterEmail`. When they differ, the inviter is a
//   promoter and `accountManagerEmail` is their assigned AM.
// - Do NOT use `inviteeEmail === accountManagerEmail` for that split.
//   Derive sale payouts from ACTIVE referrals plus `User.userType`, and apply
//   the hidden-membership resolution described in `conversion.controller`.
type ReferralMetadata = {
  accountManagerEmail?: string | null;
  inviterEmail?: string | null;
  inviteeEmail?: string | null;
  inviteCode?: string | null;
  emailSentAt?: string | null;
  expiresAt?: string | null;
  resendCount?: number;
};

const readReferralMetadata = (
  raw: Prisma.JsonValue | null | undefined,
): ReferralMetadata => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ReferralMetadata;
};

const normalizeEmail = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

/** True when this user is the assigned AM recorded on the referral metadata. */
const assignedAccountManagerMatchesUser = (
  metadata: Prisma.JsonValue | null | undefined,
  userEmail: string,
): boolean => {
  const am = normalizeEmail(
    readReferralMetadata(metadata).accountManagerEmail ?? null,
  );
  const me = normalizeEmail(userEmail);
  return Boolean(am && me && am === me);
};

/**
 * Inviter, admin, or the referral's assigned account manager (metadata
 * `accountManagerEmail`). Used anywhere a promoter-owned invite should still
 * be visible/actionable for the AM who owns that promoter line.
 */
const canAccessReferralLifecycle = (
  user: NonNullable<AuthRequest["user"]>,
  referral: { referrerId: string; metadata?: Prisma.JsonValue | null },
): boolean => {
  if (user.role === UserRole.ADMIN) return true;
  if (referral.referrerId === user.id) return true;
  return (
    user.userType === UserType.ACCOUNT_MANAGER &&
    assignedAccountManagerMatchesUser(referral.metadata, user.email)
  );
};

const computeIsExpired = (
  status: string,
  createdAt: Date,
  metadata: ReferralMetadata,
): boolean => {
  if (status !== "PENDING") return false;
  const expiresAtRaw = metadata.expiresAt;
  const expiresAtMs = expiresAtRaw
    ? Date.parse(expiresAtRaw)
    : createdAt.getTime() + REFERRAL_INVITE_TTL_MS;
  if (Number.isNaN(expiresAtMs)) return false;
  return Date.now() > expiresAtMs;
};

const buildInviteUrl = (
  campaign: { websiteUrl: string; defaultReferralUrl: string | null },
  params: {
    refCode: string;
    inviteCode: string;
    inviteeEmail: string;
    inviterEmail: string;
    accountManagerEmail: string | null;
  },
): string => {
  const targetUrl = campaign.defaultReferralUrl || campaign.websiteUrl;
  const urlObj = new URL(targetUrl);
  urlObj.searchParams.set("fpr", params.refCode);
  urlObj.searchParams.set("inviteCode", params.inviteCode);
  urlObj.searchParams.set("inviteeEmail", params.inviteeEmail);
  urlObj.searchParams.set("inviterEmail", params.inviterEmail);
  if (params.accountManagerEmail) {
    urlObj.searchParams.set("accountManagerEmail", params.accountManagerEmail);
  }
  return urlObj.toString();
};

/**
 * Published player /join links must live on the campaign website (or its
 * default referral URL). Sugar may have stored a local player origin; swap
 * the host and keep model / freeplay / card. Query parameters already on the
 * campaign URL stay, and the asset link's parameters are added on top.
 */
const landingPageOnCampaignUrl = (
  assetLink: string | null | undefined,
  campaign: { websiteUrl?: string | null; defaultReferralUrl?: string | null },
): string | null => {
  if (!assetLink) return assetLink ?? null;
  const baseRaw = (campaign.defaultReferralUrl || campaign.websiteUrl || "").trim();
  if (!baseRaw) return assetLink;
  try {
    const asset = new URL(assetLink);
    const assetPath = asset.pathname.replace(/\/+$/, "") || "/";
    if (assetPath !== "/join") return assetLink;
    const normalized = normalizeCampaignLandingUrl(baseRaw);
    if (!normalized) return assetLink;
    const campaignUrl = new URL(normalized);
    if (campaignUrl.protocol !== "http:" && campaignUrl.protocol !== "https:") {
      return assetLink;
    }
    asset.searchParams.forEach((value, key) => {
      campaignUrl.searchParams.set(key, value);
    });
    return campaignUrl.toString();
  } catch {
    return assetLink;
  }
};

export const createReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { campaignId, email } = req.body;
    const user = req.user!;

    // Mail relations come along so invite sending does not load this campaign again.
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: inviteMailFallbackSelect,
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Check if campaign is active
    if (!campaign.isActive) {
      return res
        .status(400)
        .json({ error: "Cannot create invites for inactive campaigns" });
    }

    // Block duplicates: same inviter + same campaign + same invitee email
    // on either a pending invite (metadata.inviteeEmail) or an already
    // accepted one (referredUser.email). This query matches any `PENDING`
    // or `ACTIVE` row, including pending invites whose computed expiry has
    // passed, because expiry is not represented in the persisted `status`.
    // The OR covers both the "still waiting on them to accept" and "they
    // already signed up" case in a single query.
    const existingInvite = await prisma.referral.findFirst({
      where: {
        referrerId: user.id,
        campaignId: campaign.id,
        status: { in: ["PENDING", "ACTIVE"] },
        OR: [
          {
            referredUserId: null,
            metadata: {
              path: ["inviteeEmail"],
              equals: email,
            },
          },
          {
            referredUser: { email },
          },
        ],
      },
      select: {
        id: true,
        inviteCode: true,
        status: true,
        referredUserId: true,
      },
    });

    if (existingInvite) {
      const isAccepted = existingInvite.referredUserId !== null;
      return res.status(409).json({
        error: "Duplicate invite",
        message: isAccepted
          ? `${email} has already accepted an invite on this campaign.`
          : `There's already a pending invite to ${email} on this campaign. Use Resend instead of creating a new one.`,
        existingReferralId: existingInvite.id,
        existingInviteCode: existingInvite.inviteCode,
        existingStatus: existingInvite.status,
      });
    }

    const isAdminCaller = user.role === UserRole.ADMIN;
    const isAmCaller = hasAccountManagerAccess(user);

    // Hidden campaigns are restricted to admins and account managers. AM access
    // is centralized through `hasAccountManagerAccess`, which uses `userType`
    // as the single source of truth. Pure promoters / team managers / chatters
    // still can't invite on hidden campaigns.
    if (!campaign.visibleToPromoters && !isAdminCaller && !isAmCaller) {
      return res.status(403).json({
        error: "Access denied",
        message:
          "You don't have access to this campaign. Only account managers can promote hidden campaigns.",
      });
    }

    // Account managers always invite onto the PUBLIC campaign that is
    // `linkedCampaignId` on one of their hidden membership campaigns (the
    // campaign an admin invited the AM into). They must not invite directly
    // onto the hidden membership campaign, nor onto an unrelated public
    // campaign — both would either pay the wrong commission tier or attribute
    // the referral to the wrong AM. Admins are exempt from this rule.
    if (isAmCaller && !isAdminCaller) {
      const amMembership = await prisma.referral.findFirst({
        where: {
          referredUserId: user.id,
          status: "ACTIVE",
          referrer: {
            role: UserRole.ADMIN,
          },
          campaign: {
            isActive: true,
            linkedCampaignId: campaign.id,
            visibleToPromoters: false,
          },
        },
        select: { id: true },
      });
      if (!amMembership) {
        return res.status(403).json({
          error: "Access denied",
          message:
            "Account managers can only invite under the public campaign linked to their assigned campaign.",
        });
      }
    }

    // Check monthly invite limit (Admins and Account Managers are exempt)
    if (
      campaign.maxInvitesPerMonth &&
      campaign.maxInvitesPerMonth > 0 &&
      !isAdminCaller &&
      !isAmCaller
    ) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Count ALL person invitation attempts this month (pending + accepted)
      // Customer tracking referrals have a specific pattern: referredUserId is always null when created
      // Person invitations: referredUserId is null when pending, not null when accepted
      // To exclude customer tracking: inviteCode should not match username pattern
      const user_username = await prisma.user.findUnique({
        where: { id: user.id },
        select: { username: true, email: true },
      });

      const invitesThisMonth = await prisma.referral.count({
        where: {
          referrerId: user.id,
          campaignId: campaign.id,
          inviteCode: { not: user_username?.username || "no-match" }, // Exclude customer tracking
          createdAt: { gte: startOfMonth },
        },
      });

      if (invitesThisMonth >= campaign.maxInvitesPerMonth) {
        return res.status(403).json({
          error: `Monthly invite limit reached`,
          limit: campaign.maxInvitesPerMonth,
          current: invitesThisMonth,
          message: `You can invite up to ${campaign.maxInvitesPerMonth} people per month on this campaign`,
        });
      }
    }

    // Promoters can invite for any active campaign they're participating in
    if (user.role === UserRole.PROMOTER) {
      const isParticipant = await isUserParticipantOnCampaign(
        prisma,
        user.id,
        campaignId,
      );

      // If not a participant yet and campaign requires approval, block
      if (!isParticipant && !campaign.autoApprove) {
        return res.status(403).json({
          error:
            "You must be approved for this campaign before inviting others",
        });
      }
    }

    // Generate unique invite code
    const inviteCode = nanoid(10);

    // Determine referral level. Also hoist `userReferral` so we can later
    // inherit `accountManagerEmail` from the promoter's own invite metadata
    // when they don't have a direct accountManagerId on their User row.
    let level = 1;
    let parentReferralId = null;
    let userReferral: Awaited<
      ReturnType<typeof findMembershipReferralForPublicCampaign>
    > = null;

    // If the user is an influencer, this is a second-level referral
    if (user.role === UserRole.PROMOTER) {
      // Find the referral where this user was referred (public campaign or
      // hidden membership program linked to this public campaign).
      userReferral = await findMembershipReferralForPublicCampaign(
        prisma,
        user.id,
        campaignId,
      );

      if (userReferral) {
        level = userReferral.level + 1;
        parentReferralId = userReferral.id;
      }
    }

    // Load the inviter together with their account manager so we can persist
    // the full identity bundle on the referral and resolve `inviterName` /
    // `accountManagerEmail` for the outbound email. ADMIN / ACCOUNT_MANAGER
    // inviters act as their own AM — pure promoters fall back to their
    // assigned `accountManager.email`, which may still be null for legacy
    // rows.
    const inviter = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        inviteCode: true,
        userType: true,
        role: true,
        accountManager: { select: { email: true } },
      },
    });

    if (!inviter) {
      return res.status(404).json({ error: "Inviter account not found" });
    }

    const inviterIsAmOrAdmin =
      inviter.role === UserRole.ADMIN ||
      inviter.userType === UserType.ACCOUNT_MANAGER;

    // Resolve accountManagerEmail in priority order:
    //   1. AM/admin inviter → their own email IS the AM email.
    //   2. Promoter with a direct accountManagerId → that AM's email.
    //   3. Promoter without a DB-level AM assignment → inherit from the
    //      accountManagerEmail stored on *their own* invite (userReferral).
    //      This covers the common case where a promoter was brought in by an
    //      AM via the referral flow rather than the admin "create user" form,
    //      so their accountManagerId column is null but the chain is clear.
    let accountManagerEmail: string | null = inviterIsAmOrAdmin
      ? normalizeEmail(inviter.email) || null
      : normalizeEmail(inviter.accountManager?.email ?? null) || null;

    if (!accountManagerEmail && !inviterIsAmOrAdmin && userReferral) {
      const parentMeta = readReferralMetadata(userReferral.metadata);
      accountManagerEmail =
        normalizeEmail(parentMeta.accountManagerEmail ?? null) || null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFERRAL_INVITE_TTL_MS);
    const metadata = {
      accountManagerEmail,
      inviterEmail: inviter.email,
      inviteeEmail: email as string,
      inviteCode,
      emailSentAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      resendCount: 0,
    } satisfies Prisma.InputJsonValue;

    const refCode = inviter.username || inviter.inviteCode || user.id;

    // Create the Referral and seed a matching PreUser row atomically. The
    // PreUser tracks TeaseMe onboarding lifecycle (step 0..N) until the
    // invitee registers on our side, at which point the register handler
    // deletes it. Keeping both writes in one transaction guarantees we never
    // have a pending invite without its lifecycle row.
    //
    // Seed Referral.onboarding.surveyLink with the invite URL so the
    // "Open onboarding session" pill is clickable immediately. Product
    // refreshes overwrite forward-only.
    const referral = await prisma.$transaction(async (tx) => {
      const created = await tx.referral.create({
        data: {
          inviteCode,
          campaignId,
          referrerId: user.id,
          level,
          parentReferralId,
          status: "PENDING",
          metadata,
        },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              websiteUrl: true,
              defaultReferralUrl: true,
              commissionRate: true,
              secondaryRate: true,
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
        },
      });

      // Seed product onboarding cache with the invite URL so "Open onboarding"
      // works before TeaseMe/Sugar returns a session URL. Products own the
      // real pre-user; this is Referral read-cache only.
      const seedInviteUrl = buildInviteUrl(created.campaign, {
        refCode,
        inviteCode,
        inviteeEmail: email as string,
        inviterEmail: inviter.email,
        accountManagerEmail,
      });

      await tx.referral.update({
        where: { id: created.id },
        data: {
          onboarding: onboardingToJson(
            seedOnboardingSnapshot(seedInviteUrl, email as string),
          ),
          onboardingCheckedAt: null,
        },
      });

      return created;
    });

    const inviteUrl = buildInviteUrl(referral.campaign, {
      refCode,
      inviteCode,
      inviteeEmail: email as string,
      inviterEmail: inviter.email,
      accountManagerEmail,
    });

    // Send email with the "Accept Invite" button pointing at `inviteUrl`.
    // Failures are surfaced via `emailSent: false` rather than failing the
    // whole request — the inviter can still copy/share the link manually.
    const inviterName =
      [inviter.firstName, inviter.lastName].filter(Boolean).join(" ").trim() ||
      inviter.username ||
      inviter.email;

    let emailSent = false;
    const mail = pickInviteMail(campaign);
    if (mail) {
      try {
        emailSent = await emailService.sendReferralInviteEmail({
          inviteeEmail: email as string,
          inviterName,
          campaignName: referral.campaign.name,
          acceptUrl: inviteUrl,
          mail,
        });
      } catch (emailError) {
        console.error("Referral invite email failed:", emailError);
        emailSent = false;
      }
    }

    res.status(201).json({
      referral,
      inviteUrl,
      inviteCode,
      emailSent,
      mailConfigured: Boolean(mail),
      fromEmail: mail ? outboundFromAddress(mail) : null,
      message: "Referral invite created successfully",
    });
  } catch (error) {
    console.error("Create referral error:", error);
    res.status(500).json({ error: "Failed to create referral invite" });
  }
};

export const resendReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            defaultReferralUrl: true,
            ...inviteMailCampaignSelect,
          },
        },
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            inviteCode: true,
          },
        },
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Referral not found" });
    }

    // Inviter, admin, or the promoter line's assigned AM (metadata) may resend.
    if (!canAccessReferralLifecycle(user, referral)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (referral.status !== "PENDING" || referral.referredUserId) {
      return res
        .status(400)
        .json({ error: "Only pending invites can be resent" });
    }

    const metadata = readReferralMetadata(referral.metadata);
    const inviteeEmail = metadata.inviteeEmail;
    if (!inviteeEmail) {
      return res.status(400).json({
        error:
          "This invite has no recorded invitee email (created before the email-required flow). Please create a new invite.",
      });
    }
    const inviterEmail = metadata.inviterEmail ?? referral.referrer.email;
    const accountManagerEmail = metadata.accountManagerEmail ?? null;

    const refCode =
      referral.referrer.username ||
      referral.referrer.inviteCode ||
      referral.referrerId;
    const inviteUrl = buildInviteUrl(referral.campaign, {
      refCode,
      inviteCode: referral.inviteCode,
      inviteeEmail,
      inviterEmail,
      accountManagerEmail,
    });

    // Push expiry forward 24h from now and bump `resendCount`. We do this
    // BEFORE sending so concurrent resend clicks can't both "win" and
    // double-send — the second request sees the fresh emailSentAt and could
    // be rate-limited later if needed.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFERRAL_INVITE_TTL_MS);
    const nextMetadata = {
      ...metadata,
      inviteeEmail,
      inviterEmail,
      accountManagerEmail,
      inviteCode: referral.inviteCode,
      emailSentAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      resendCount: (metadata.resendCount ?? 0) + 1,
    } satisfies Prisma.InputJsonValue;

    await prisma.referral.update({
      where: { id: referral.id },
      data: { metadata: nextMetadata },
    });

    // Force the next My Promoters load to re-poll the product immediately.
    // Re-seed onboarding cache when missing; never clobber an upstream
    // surveyLink already cached on the Referral.
    const snap = readOnboardingSnapshot(referral.onboarding);
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        onboardingCheckedAt: null,
        onboarding: onboardingToJson({
          ...snap,
          email: snap.email || inviteeEmail || null,
          surveyLink: snap.surveyLink ?? inviteUrl,
        }),
      },
    });

    const inviterName =
      [referral.referrer.firstName, referral.referrer.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      referral.referrer.username ||
      referral.referrer.email;

    let emailSent = false;
    const mail = pickInviteMail(referral.campaign);
    if (mail) {
      try {
        emailSent = await emailService.sendReferralInviteEmail({
          inviteeEmail,
          inviterName,
          campaignName: referral.campaign.name,
          acceptUrl: inviteUrl,
          mail,
        });
      } catch (emailError) {
        console.error("Referral invite resend failed:", emailError);
        emailSent = false;
      }
    }

    return res.json({
      emailSent,
      mailConfigured: Boolean(mail),
      fromEmail: mail ? outboundFromAddress(mail) : null,
      inviteUrl,
      inviteeEmail,
      expiresAt: expiresAt.toISOString(),
      resendCount: nextMetadata.resendCount,
      message: emailSent
        ? "Invite email resent"
        : mail
          ? "Invite updated but email delivery failed"
          : "Invite updated but no email was sent because this campaign has no mail login",
    });
  } catch (error) {
    console.error("Resend referral invite error:", error);
    return res.status(500).json({ error: "Failed to resend invite" });
  }
};

export const deleteReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const referral = await prisma.referral.findUnique({
      where: { id },
      select: {
        id: true,
        referrerId: true,
        referredUserId: true,
        status: true,
        metadata: true,
        _count: { select: { childReferrals: true } },
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Referral not found" });
    }

    const isAdminCaller = user.role === UserRole.ADMIN;

    // Inviter, admin, or assigned account manager (same boundary as resend).
    if (!isAdminCaller && !canAccessReferralLifecycle(user, referral)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Non-admin callers: refuse to delete anything that has downstream state
    // attached. Pending and explicitly-denied (CANCELLED) invites are both
    // safe to hard-delete because neither has a referredUser attached.
    // Admins get the escape hatch — they can delete accepted/active referrals
    // too, with the FK cleanup below — so they can reallocate or remove
    // assignments for users that are stuck on the Users page delete path.
    if (!isAdminCaller) {
      const deletableStatuses = new Set(["PENDING", "CANCELLED"]);
      if (referral.referredUserId || !deletableStatuses.has(referral.status)) {
        return res.status(400).json({
          error:
            "Only pending or denied invites can be deleted. This referral has already been accepted.",
        });
      }
      if (referral._count.childReferrals > 0) {
        return res.status(400).json({
          error:
            "Cannot delete a referral that has downstream referrals attached.",
        });
      }
    }

    // Clean up the FKs that don't cascade before deleting the referral itself.
    //   • Commission.referralId (nullable, no onDelete) → null it out so the
    //     commission rows survive for audit / payout history.
    //   • Referral.parentReferralId (nullable, no onDelete) → null it out on
    //     child referrals so they aren't orphaned with a dangling FK.
    //   • ClickTracking.referralId (nullable, no onDelete) → same treatment.
    //   • Customer.referralId (nullable, no onDelete) → null it out so revenue
    //     attribution rows survive.
    //   • Transaction.referralId (nullable, no onDelete) → same treatment.
    //   • PreUser.referralId cascades on delete so it goes away automatically.
    await prisma.$transaction(async (tx) => {
      await tx.commission.updateMany({
        where: { referralId: referral.id },
        data: { referralId: null },
      });
      await tx.referral.updateMany({
        where: { parentReferralId: referral.id },
        data: { parentReferralId: null },
      });
      await tx.clickTracking.updateMany({
        where: { referralId: referral.id },
        data: { referralId: null },
      });
      await tx.customer.updateMany({
        where: { referralId: referral.id },
        data: { referralId: null },
      });
      await tx.transaction.updateMany({
        where: { referralId: referral.id },
        data: { referralId: null },
      });
      await tx.referral.delete({ where: { id: referral.id } });
    });

    return res.json({ success: true, id: referral.id });
  } catch (error) {
    console.error("Delete referral invite error:", error);
    return res.status(500).json({ error: "Failed to delete invite" });
  }
};

// ─── Lifecycle action endpoints (My Promoters card buttons) ─────────────────
//
// These four endpoints drive the state transitions the UI renders as chips:
// Waiting → Order LP → Building → LP Live (plus a Deny short-circuit). In all
// four, TeaseMe owns the authoritative `preUser.status` — we proxy the click
// upstream, then either repoll `/step-progress` to pick up the new status or
// rely on TeaseMe's own response to include it. Upstream failures return a
// non-2xx so the UI can toast without losing local state.

// Shared lookup that loads a referral + its preUser + permission-checks the
// caller. Inviter, admin, or assigned account manager (metadata) may act —
// aligned with getMyReferrals / resend / delete so AMs can approve LPs for
// their promoters' invites.
const loadReferralForAction = async (
  id: string,
  user: NonNullable<AuthRequest["user"]>,
) => {
  const referral = await prisma.referral.findUnique({
    where: { id },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          defaultReferralUrl: true,
        },
      },
      referredUser: {
        select: { id: true, email: true },
      },
    },
  });
  if (!referral) return { error: { code: 404, message: "Referral not found" } };
  if (!canAccessReferralLifecycle(user, referral)) {
    return { error: { code: 403, message: "Access denied" } };
  }
  return { referral: attachOnboardingView(referral) };
};

export const denyReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { reason } = (req.body ?? {}) as { reason?: string };

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    if (referral.status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "Only pending referrals can be denied" });
    }

    // Deny is a best-effort operation: the authoritative "this AM rejected
    // the promoter" flag lives in OUR database (referral.status = CANCELLED),
    // the TeaseMe notification is a courtesy so their onboarding UI can
    // suppress further nudges. If upstream is unreachable (e.g. endpoint not
    // yet deployed), we still flip local status and log the upstream miss
    // rather than block the AM's workflow. order-landing-page stays strict
    // because that one genuinely triggers upstream work.
    const upstream = await denyPreInfluencer({
      inviteCode: referral.inviteCode,
      email: referral.preUser?.email,
      reason,
    });
    if (!upstream) {
      console.warn(
        "[denyReferralInvite] upstream deny failed — flipping local status only",
        {
          referralId: referral.id,
          inviteCode: referral.inviteCode,
        },
      );
    }

    // Schema's ReferralStatus enum is PENDING|ACTIVE|COMPLETED|CANCELLED.
    // "Deny" maps to CANCELLED — we don't keep a separate soft-delete state.
    const updated = await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "CANCELLED" },
      select: { id: true, status: true },
    });

    return res.json({
      success: true,
      referral: updated,
      upstreamNotified: upstream !== null,
    });
  } catch (error) {
    console.error("Deny referral invite error:", error);
    return res.status(500).json({ error: "Failed to deny referral" });
  }
};

export const reassignReferralInvite = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const user = req.user!;
    const { newReferrerId } = req.body as { newReferrerId: string };

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    // Reassignment is an AM-level action — a plain promoter inviter must not
    // be able to change commission ownership on their own referrals.
    const isAdminCaller = user.role === UserRole.ADMIN;
    if (!isAdminCaller && user.userType !== UserType.ACCOUNT_MANAGER) {
      return res.status(403).json({
        error:
          "Access denied: only account managers or admins can reassign referrals",
      });
    }

    // Non-admin callers: reassignment only makes sense for pending referrals
    // that haven't been accepted yet. Once a referred user has signed up,
    // commission attribution is already in motion and ownership changes are
    // disallowed for AMs. Admins get an escape hatch so they can reallocate
    // stuck/accepted referrals (e.g. before deleting a user, or to recover
    // from a misfired invite).
    if (!isAdminCaller) {
      if (referral.status !== "PENDING" || referral.referredUser !== null) {
        return res.status(400).json({
          error:
            "Only pending referrals without an accepted invitee can be reassigned",
        });
      }
    } else if (referral.status === "COMPLETED") {
      // Even admins shouldn't move commission ownership on a fully-settled
      // referral. That's effectively rewriting payout history; if it ever
      // really needs to happen, do it from the DB under an audit trail.
      return res.status(400).json({
        error: "Completed referrals cannot be reassigned",
      });
    }

    // The new referrer must be an account manager (the common case) or, for
    // admin callers only, another admin. Both shapes keep commission
    // attribution owned by someone the invite system already knows about.
    const newReferrer = await prisma.user.findFirst({
      where: isAdminCaller
        ? {
            id: newReferrerId,
            OR: [
              { userType: UserType.ACCOUNT_MANAGER },
              { role: UserRole.ADMIN },
            ],
          }
        : { id: newReferrerId, userType: UserType.ACCOUNT_MANAGER },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!newReferrer) {
      return res.status(404).json({
        error: isAdminCaller
          ? "New referrer must be an account manager or admin"
          : "New account manager not found",
      });
    }

    // No-op guard: reassigning to the current referrer is a waste of an
    // upstream call and would confuse TeaseMe's own bookkeeping.
    if (newReferrer.id === referral.referrerId) {
      return res.status(400).json({
        error: "Referral is already assigned to this user",
      });
    }

    // Reassign is best-effort upstream: ownership attribution is ours
    // (referral.referrerId + metadata.accountManagerEmail), TeaseMe only
    // needs to be told so its onboarding emails reference the new AM. If
    // upstream is unreachable we still flip local ownership and log.
    const upstream = await reassignPreInfluencer({
      inviteCode: referral.inviteCode,
      email: referral.preUser?.email,
      newManagerEmail: newReferrer.email,
    });
    if (!upstream) {
      console.warn(
        "[reassignReferralInvite] upstream reassign failed — flipping local ownership only",
        {
          referralId: referral.id,
          inviteCode: referral.inviteCode,
        },
      );
    }

    const metadata = readReferralMetadata(referral.metadata);
    const nextMetadata = {
      ...metadata,
      accountManagerEmail: normalizeEmail(newReferrer.email) || null,
    } satisfies Prisma.InputJsonValue;

    const updated = await prisma.referral.update({
      where: { id: referral.id },
      data: {
        referrerId: newReferrer.id,
        metadata: nextMetadata,
      },
      select: {
        id: true,
        referrerId: true,
      },
    });

    return res.json({
      success: true,
      referral: updated,
      newReferrer,
      upstreamNotified: upstream !== null,
    });
  } catch (error) {
    console.error("Reassign referral invite error:", error);
    return res.status(500).json({ error: "Failed to reassign referral" });
  }
};

const sugarPackageStillOpen = (preUser: {
  currentStep: number;
  status: string;
}): boolean =>
  preUser.status !== "live" &&
  preUser.status !== "building" &&
  preUser.currentStep < 3;

type PackageStepStamp = {
  id: string;
  currentStep: number;
  status: string;
  updatedAt: Date;
  onboarding: Prisma.JsonValue | null;
};

const readPackageStepStamp = async (
  referralId: string,
): Promise<PackageStepStamp | null> => {
  const row = await prisma.referral.findUnique({
    where: { id: referralId },
    select: {
      id: true,
      updatedAt: true,
      onboarding: true,
    },
  });
  if (!row) return null;
  const snap = readOnboardingSnapshot(row.onboarding);
  return {
    id: row.id,
    currentStep: snap.currentStep,
    status: snap.status,
    updatedAt: row.updatedAt,
    onboarding: row.onboarding,
  };
};

const readCurrentStep = async (
  referralId: string,
  fallback: number,
): Promise<number> => {
  const fresh = await prisma.referral.findUnique({
    where: { id: referralId },
    select: { onboarding: true },
  });
  if (!fresh) return fallback;
  return readOnboardingSnapshot(fresh.onboarding).currentStep;
};

// A missing pack rolls step 2 back to 1 only when Sugar's survey_step is
// missing or still below 2. Optimistic lock uses Referral.updatedAt +
// matching cached currentStep/status.
const claimMissingPackageStep = async (
  stamp: PackageStepStamp,
  upstreamStep: number | null,
): Promise<{ rewound: boolean; currentStep: number }> => {
  const sugarAgreesMissing = upstreamStep == null || upstreamStep < 2;
  if (
    !sugarAgreesMissing ||
    !sugarPackageStillOpen(stamp) ||
    stamp.currentStep < 2
  ) {
    return {
      rewound: false,
      currentStep: await readCurrentStep(stamp.id, stamp.currentStep),
    };
  }
  const nextSnap = {
    ...readOnboardingSnapshot(stamp.onboarding),
    currentStep: 1,
  };
  const claimed = await prisma.referral.updateMany({
    where: {
      id: stamp.id,
      updatedAt: stamp.updatedAt,
    },
    data: {
      onboarding: onboardingToJson(nextSnap),
      onboardingCheckedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    return {
      rewound: false,
      currentStep: await readCurrentStep(stamp.id, stamp.currentStep),
    };
  }
  return { rewound: true, currentStep: 1 };
};

export const getReferralPackageWorkspace = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    if (
      user.role !== UserRole.ADMIN &&
      user.userType !== UserType.ACCOUNT_MANAGER
    ) {
      return res.status(403).json({
        error:
          "Access denied: only account managers or admins can open the package workspace",
      });
    }

    if (!isSugarScratchCampaign(referral.campaign?.name)) {
      return res.status(400).json({
        error: "Package workspace is only available for Sugar Scratchie campaigns.",
      });
    }

    if (!referral.preUser) {
      return res.status(400).json({
        error:
          "This invite has no pre-influencer attached yet — the user hasn't confirmed email and name.",
      });
    }

    const packageStamp = await readPackageStepStamp(referral.preUser.id);
    const workspace = await getSugarPackageWorkspace({
      inviteCode: referral.inviteCode,
      email: referral.preUser.email,
    });
    if (!workspace?.ok) {
      return res.status(workspace?.statusCode === 400 ? 400 : 502).json({
        error:
          workspace?.error ||
          "Sugar Scratchie couldn't open the packs workspace right now.",
      });
    }

    // Mirror a missing pack down to 1 only when Sugar's survey_step agrees
    // it is still below 2 and make-package has not saved the row since the
    // stamp above. Otherwise keep the step make-package just wrote.
    const surveyStep =
      packageStamp && !workspace.packageReady
        ? (await claimMissingPackageStep(packageStamp, workspace.surveyStep))
            .currentStep
        : packageStamp
          ? await readCurrentStep(
              packageStamp.id,
              packageStamp.currentStep,
            )
          : referral.preUser.currentStep;

    return res.json({
      success: true,
      modelId: workspace.modelId,
      packsUrl: workspace.packsUrl,
      packageReady: workspace.packageReady,
      surveyStep,
    });
  } catch (error) {
    console.error("Package workspace error:", error);
    return res.status(500).json({ error: "Failed to open package workspace" });
  }
};

export const makeReferralPackage = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    if (
      user.role !== UserRole.ADMIN &&
      user.userType !== UserType.ACCOUNT_MANAGER
    ) {
      return res.status(403).json({
        error:
          "Access denied: only account managers or admins can make the package",
      });
    }

    if (!isSugarScratchCampaign(referral.campaign?.name)) {
      return res.status(400).json({
        error: "Make package is only available for Sugar Scratchie campaigns.",
      });
    }

    const isExpired = computeIsExpired(
      referral.status,
      referral.createdAt,
      readReferralMetadata(referral.metadata),
    );
    if (referral.status === "CANCELLED" || isExpired) {
      return res.status(400).json({
        error: "A package can only be made for active or pending referrals",
      });
    }

    if (!referral.preUser) {
      return res.status(400).json({
        error:
          "This invite has no pre-influencer attached yet — the user hasn't confirmed email and name.",
      });
    }

    if ((referral.preUser.currentStep ?? 0) < 1) {
      return res.status(400).json({
        error: "Confirm email and name before making the package.",
      });
    }

    const sugarUpstream = await makeSugarPackage({
      inviteCode: referral.inviteCode,
      email: referral.preUser.email,
    });
    if (!sugarUpstream || !sugarUpstream.ok) {
      console.warn("[make-package] sugar make-package failed", {
        referralId: referral.id,
        inviteCode: referral.inviteCode,
        email: referral.preUser.email,
        statusCode: sugarUpstream?.statusCode,
        error: sugarUpstream?.error,
      });
      // Pack missing: Sugar rolls survey_step back to 1 via webhook. Mirror
      // that locally so the checklist stops showing Make package as done.
      if (sugarUpstream?.statusCode === 409) {
        const now = new Date();
        const rolled =
          referral.preUser.currentStep >= 2 ? 1 : referral.preUser.currentStep;
        const updatedPreUser = await patchReferralOnboarding(
          prisma,
          referral.preUser.id,
          {
            currentStep: rolled,
            lastCheckedAt: now,
            // Pack-not-ready may roll step 2 → 1 before LP live.
            allowStepRewind: rolled < referral.preUser.currentStep,
          },
        );
        return res.status(409).json({
          error:
            sugarUpstream.error ||
            "Pack video not ready yet. Run foil n8n in the operator app first.",
          preUser: updatedPreUser,
        });
      }
      return res.status(502).json({
        error:
          "Sugar Scratchie couldn't mark the package ready right now. Please try again in a moment.",
      });
    }

    const now = new Date();
    const history = readStepHistory(referral.preUser.stepHistory);
    const nextStep = Math.max(
      referral.preUser.currentStep,
      sugarUpstream.surveyStep ?? 2,
      2,
    );
    const nextHistory =
      nextStep > referral.preUser.currentStep
        ? [...history, { step: nextStep, at: now.toISOString() }].slice(
            -STEP_HISTORY_MAX,
          )
        : history;

    const updatedPreUser = await patchReferralOnboarding(
      prisma,
      referral.preUser.id,
      {
        currentStep: nextStep,
        status: chooseForwardStatus(
          referral.preUser.status,
          sugarUpstream.status ?? referral.preUser.status,
        ),
        lastCheckedAt: now,
        stepHistory: nextHistory as unknown as Prisma.JsonValue,
      },
    );

    return res.json({ success: true, preUser: updatedPreUser });
  } catch (error) {
    console.error("Make package error:", error);
    return res.status(500).json({ error: "Failed to make package" });
  }
};

export const orderReferralLandingPage = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    // Ordering a landing page is an AM-level action — restrict to account
    // managers and admins only.
    if (
      user.role !== UserRole.ADMIN &&
      user.userType !== UserType.ACCOUNT_MANAGER
    ) {
      return res.status(403).json({
        error:
          "Access denied: only account managers or admins can order landing pages",
      });
    }

    // Only act on referrals that are still in progress (PENDING or ACTIVE).
    // CANCELLED referrals, or PENDING ones whose invite window lapsed, should
    // not trigger new upstream work. Note: ReferralStatus has no "EXPIRED"
    // variant — expiry is derived at read time via computeIsExpired().
    const isExpired = computeIsExpired(
      referral.status,
      referral.createdAt,
      readReferralMetadata(referral.metadata),
    );
    if (referral.status === "CANCELLED" || isExpired) {
      return res.status(400).json({
        error:
          "A landing page can only be ordered for active or pending referrals",
      });
    }

    if (!referral.preUser) {
      return res.status(400).json({
        error:
          "This invite has no TeaseMe pre-influencer attached yet — the user hasn't started onboarding.",
      });
    }

    // The "Order Landing Page" click is a thin orchestration around the
    // upstream contract:
    //   Sugar Scratchie campaigns → POST Sugar /order-landing-page (step 3).
    //   TeaseMe campaigns → POST /approve, then re-poll /step-progress.
    const sugarCampaign = isSugarScratchCampaign(referral.campaign?.name);
    const now = new Date();
    let updateData: {
      currentStep?: number;
      status?: string;
      teasemeUserId?: string | null;
      surveyLink?: string | null;
      assetLink?: string | null;
      lastCheckedAt?: Date | null;
      stepHistory?: Prisma.InputJsonValue;
    } = { lastCheckedAt: now };

    if (sugarCampaign) {
      // Sugar publishes the player /join LP URL on this call (status live)
      // after n8n package step 2. Persist live locally when the body omits
      // status so welcome email / polling stop / auto-accept do not wait
      // solely on the webhook.
      const packageStillOpen = sugarPackageStillOpen(referral.preUser);
      if (packageStillOpen && referral.preUser.currentStep < 2) {
        return res.status(400).json({
          error: "Make the n8n package before ordering a landing page.",
        });
      }

      // Stamp the row before the Sugar call. A lost stamp (the card repair
      // bumps updatedAt, or survey_step is still >= 2) is not permission to
      // publish: order only if a newer read shows the pack is actually ready.
      // Otherwise rewind and return the row, including a step a concurrent
      // repair already moved to 1.
      const packNotReadyMessage =
        "Pack video not ready yet. Finish Make package before ordering the landing page.";
      let packageStamp: PackageStepStamp | null = null;
      if (packageStillOpen && referral.preUser.currentStep >= 2) {
        packageStamp = await readPackageStepStamp(referral.preUser.id);
        const workspace = packageStamp
          ? await getSugarPackageWorkspace({
              inviteCode: referral.inviteCode,
              email: referral.preUser.email,
            })
          : null;
        if (
          packageStamp &&
          workspace?.ok === true &&
          !workspace.packageReady
        ) {
          const claimed = await claimMissingPackageStep(
            packageStamp,
            workspace.surveyStep,
          );
          let packMissing = claimed.rewound || claimed.currentStep < 2;
          if (!packMissing) {
            const fresh = await readPackageStepStamp(referral.preUser.id);
            if (fresh && fresh.currentStep < 2) {
              packMissing = true;
            } else if (
              fresh &&
              sugarPackageStillOpen(fresh) &&
              fresh.currentStep >= 2
            ) {
              const again = await getSugarPackageWorkspace({
                inviteCode: referral.inviteCode,
                email: referral.preUser.email,
              });
              // A failed follow-up read is not proof the pack is missing.
              // A row that is already live or past step 2 is published below.
              if (again?.ok === true && !again.packageReady) {
                const stamp = await readPackageStepStamp(referral.preUser.id);
                if (stamp && stamp.currentStep < 2) {
                  packMissing = true;
                } else if (
                  stamp &&
                  sugarPackageStillOpen(stamp) &&
                  stamp.currentStep >= 2
                ) {
                  await claimMissingPackageStep(stamp, null);
                  packMissing = true;
                }
              }
            }
          }
          if (packMissing) {
            const updatedPreUser = toOnboardingView(
              await prisma.referral.findUniqueOrThrow({
                where: { id: referral.preUser.id },
                select: referralOnboardingSelect,
              }),
            );
            return res.status(409).json({
              error: packNotReadyMessage,
              preUser: updatedPreUser,
            });
          }
        }
      }

      const campaignUrl = normalizeCampaignLandingUrl(
        referral.campaign.defaultReferralUrl || referral.campaign.websiteUrl,
      );
      const sugarUpstream = await orderSugarLandingPage({
        inviteCode: referral.inviteCode,
        email: referral.preUser.email,
        ...(campaignUrl ? { campaignUrl } : {}),
      });
      if (!sugarUpstream?.ok) {
        console.warn("[order-landing-page] sugar order-lp failed", {
          referralId: referral.id,
          inviteCode: referral.inviteCode,
          email: referral.preUser.email,
          statusCode: sugarUpstream?.statusCode,
          error: sugarUpstream?.error,
        });
        if (packageStillOpen && sugarUpstream?.statusCode === 409) {
          const claimed = packageStamp
            ? await claimMissingPackageStep(packageStamp, null)
            : {
                rewound: false,
                currentStep: referral.preUser.currentStep,
              };
          if (!claimed.rewound && claimed.currentStep >= 2) {
            const fresh = await readPackageStepStamp(referral.preUser.id);
            if (
              fresh &&
              sugarPackageStillOpen(fresh) &&
              fresh.currentStep >= 2
            ) {
              await claimMissingPackageStep(fresh, null);
            }
          }
          const updatedPreUser = toOnboardingView(
            await prisma.referral.findUniqueOrThrow({
              where: { id: referral.preUser.id },
              select: referralOnboardingSelect,
            }),
          );
          return res.status(409).json({
            error: sugarUpstream.error || packNotReadyMessage,
            preUser: updatedPreUser,
          });
        }
        const statusCode = sugarUpstream?.statusCode === 400 ? 400 : 502;
        return res.status(statusCode).json({
          error:
            sugarUpstream?.error ||
            "Sugar Scratchie couldn't start the landing-page build right now. Please try again in a moment.",
        });
      }
      const history = readStepHistory(referral.preUser.stepHistory);
      const nextStep = Math.max(referral.preUser.currentStep, 3);
      const nextHistory =
        nextStep > referral.preUser.currentStep
          ? [...history, { step: nextStep, at: now.toISOString() }].slice(
              -STEP_HISTORY_MAX,
            )
          : history;
      // The Sugar webhook can land while this request is in flight and is
      // the only writer of assetLink when the HTTP body omits it. Writing
      // the pre-request snapshot (usually null) would erase that URL, and
      // a live row is no longer polled. Leave the column alone unless this
      // response actually carries a link.
      updateData = {
        currentStep: nextStep,
        status: chooseForwardStatus(
          referral.preUser.status,
          sugarUpstream.status ?? "live",
        ),
        ...(sugarUpstream.assetLink
          ? { assetLink: sugarUpstream.assetLink }
          : {}),
        lastCheckedAt: now,
        stepHistory: nextHistory as unknown as Prisma.InputJsonValue,
      };
    } else {
      const upstream = await approvePreInfluencer({
        inviteCode: referral.inviteCode,
        email: referral.preUser.email,
      });
      if (!upstream) {
        console.warn("[order-landing-page] upstream approve failed", {
          referralId: referral.id,
          inviteCode: referral.inviteCode,
          email: referral.preUser.email,
        });
        return res.status(502).json({
          error:
            "TeaseMe couldn't start the landing-page build right now. Please try again in a moment.",
        });
      }
      const status = await fetchTeasemePreUserStatus({
        email: referral.preUser.email,
        inviteCode: referral.inviteCode ?? undefined,
      });
      if (status) {
        const history = readStepHistory(referral.preUser.stepHistory);
        const nextHistory =
          status.step > referral.preUser.currentStep
            ? [...history, { step: status.step, at: now.toISOString() }].slice(
                -STEP_HISTORY_MAX,
              )
            : history;

        updateData = {
          // Never go backwards — if upstream's poll lags and reports a
          // lower step than we already have, keep the higher one. The
          // rank-based chooseForwardStatus() does the same for the status
          // string field.
          currentStep: Math.max(referral.preUser.currentStep, status.step),
          status: chooseForwardStatus(referral.preUser.status, status.status),
          teasemeUserId: status.teasemeUserId ?? referral.preUser.teasemeUserId,
          // Don't null out a previously-known link if a later poll omits
          // it — surveyLink populates first, then assetLink later.
          surveyLink: status.surveyLink ?? referral.preUser.surveyLink,
          assetLink: status.assetLink ?? referral.preUser.assetLink,
          lastCheckedAt: now,
          stepHistory: nextHistory as unknown as Prisma.InputJsonValue,
        };
      }
    }

    const updatedPreUser = await patchReferralOnboarding(
      prisma,
      referral.preUser.id,
      {
        ...updateData,
        stepHistory:
          updateData.stepHistory === undefined
            ? undefined
            : (updateData.stepHistory as Prisma.JsonValue),
      },
    );

    return res.json({ success: true, preUser: updatedPreUser });
  } catch (error) {
    console.error("Order landing page error:", error);
    return res.status(500).json({ error: "Failed to order landing page" });
  }
};

export const assignReferralChatters = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const user = req.user!;
    const { chatterGroupId } = req.body as { chatterGroupId: string };

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    // Assigning chatters links chatter groups to promoter accounts and affects
    // operations — restrict to account managers and admins only.
    if (
      user.role !== UserRole.ADMIN &&
      user.userType !== UserType.ACCOUNT_MANAGER
    ) {
      return res.status(403).json({
        error:
          "Access denied: only account managers or admins can assign chatter groups",
      });
    }

    // Assigning chatters only makes sense once the invitee has signed up —
    // otherwise there's no User row to link the group to.
    //
    // Pin the narrowed referredUser into a local const so TypeScript keeps
    // the non-null narrowing across the async transaction callback below
    // (control-flow narrowing on property access is lost across awaits).
    const referredUser = referral.referredUser;
    if (!referredUser) {
      return res.status(400).json({
        error:
          "Chatters can only be assigned after the promoter has registered on the platform.",
      });
    }

    const chatterGroup = await prisma.chatterGroup.findUnique({
      where: { id: chatterGroupId },
      select: { id: true, name: true },
    });
    if (!chatterGroup) {
      return res.status(404).json({ error: "Chatter group not found" });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // If the group is already linked to a different promoter, unlink them
        // first so the one-to-one relation on User.chatterGroupId stays valid.
        const existingPromoter = await tx.user.findFirst({
          where: { chatterGroupId: chatterGroup.id },
          select: { id: true },
        });

        if (existingPromoter && existingPromoter.id !== referredUser.id) {
          await tx.user.update({
            where: { id: existingPromoter.id },
            data: { chatterGroupId: null },
          });
        }

        await tx.user.update({
          where: { id: referredUser.id },
          data: { chatterGroupId: chatterGroup.id },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return res.status(409).json({
          error:
            "Unable to assign chatter group because it is already assigned to another promoter.",
        });
      }

      throw error;
    }
    // Best-effort upstream notification. Failure here doesn't roll back the
    // local assignment — the chatter group is ours, not TeaseMe's, so once
    // it's persisted the button action has already "worked" locally.
    const upstream = await notifyChattersAssigned({
      inviteCode: referral.inviteCode,
      email: referredUser.email,
      chatterGroupId: chatterGroup.id,
    });
    if (!upstream) {
      console.warn(
        "[assignReferralChatters] upstream notify returned non-2xx",
        {
          referralId: referral.id,
        },
      );
    }

    return res.json({
      success: true,
      chatterGroup,
    });
  } catch (error) {
    console.error("Assign chatters error:", error);
    return res.status(500).json({ error: "Failed to assign chatter group" });
  }
};

/**
 * ensureInfluencerGroup
 *
 * Idempotent: if the promoter attached to this referral already has a
 * dedicated "{name} - Group", return it. Otherwise create it, link it
 * to the user, and return the new group. The group name is derived from
 * the TeaseMe public username (best) → DB username → firstName → email.
 *
 * This is called by the "Assign Chatters" button so the AM lands on the
 * Chatters page already opened on the right group.
 */
export const ensureInfluencerGroup = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    if (
      user.role !== UserRole.ADMIN &&
      user.userType !== UserType.ACCOUNT_MANAGER
    ) {
      return res.status(403).json({
        error:
          "Access denied: only account managers or admins can manage chatter groups",
      });
    }

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    const referredUser = referral.referredUser;
    if (!referredUser) {
      return res.status(400).json({
        error:
          "A chatter group can only be created after the promoter has registered on the platform.",
      });
    }

    // Re-read the user to get the full set of fields we need for the name.
    const promotedUser = await prisma.user.findUnique({
      where: { id: referredUser.id },
      select: {
        id: true,
        firstName: true,
        username: true,
        chatterGroupId: true,
        accountManagerId: true,
      },
    });
    if (!promotedUser) {
      return res.status(404).json({ error: "Promoted user not found." });
    }

    // Fetch the real TeaseMe public handle for the group name.
    let teasemeUsername: string | null = null;
    if (referral.preUser) {
      try {
        const stepStatus = await fetchTeasemePreUserStatus({
          email: referral.preUser.email,
          inviteCode: referral.preUser.inviteCode ?? undefined,
        });
        teasemeUsername = stepStatus?.username ?? null;
      } catch { /* non-fatal */ }
    }

    const influencerName =
      teasemeUsername ||
      promotedUser.username ||
      promotedUser.firstName ||
      referredUser.email.split("@")[0];
    const dedicatedGroupName = `${influencerName} - Group`;

    // Resolve the account manager for createdById (needed before the
    // transaction so we don't nest an async DB call inside the tx).
    const { accountManagerId: amFromChain } = await resolveOwnership(
      prisma,
      id,
    );
    const amId = amFromChain ?? promotedUser.accountManagerId ?? user.id;

    // Atomic find-or-create inside a transaction.
    // 1. Check if the user's current group is already the dedicated one.
    // 2. Check if a group with that name already exists anywhere (catches
    //    race-condition duplicates from concurrent requests or the webhook).
    // 3. Only create if truly absent.
    const { group, created } = await prisma.$transaction(async (tx) => {
      // Fast-path: user is already linked to the dedicated group.
      if (promotedUser.chatterGroupId) {
        const linked = await tx.chatterGroup.findUnique({
          where: { id: promotedUser.chatterGroupId },
          select: { id: true, name: true, commissionPercentage: true },
        });
        if (linked?.name === dedicatedGroupName) {
          return { group: linked, created: false };
        }
      }

      // Check if a safe-to-adopt group with this name already exists
      // (from a concurrent request, the webhook, or promotePreUserToUser).
      // Restrict adoption to unowned groups so we do not accidentally grab
      // another promoter's dedicated group just because the name matches.
      const byName = await tx.chatterGroup.findFirst({
        where: { name: dedicatedGroupName, promoter: null },
        select: { id: true, name: true, commissionPercentage: true },
      });
      if (byName) {
        // Adopt the existing safe group if the user isn't already linked to it.
        if (promotedUser.chatterGroupId !== byName.id) {
          try {
            await tx.user.update({
              where: { id: promotedUser.id },
              data: { chatterGroupId: byName.id },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              const fallbackGroup = await tx.chatterGroup.create({
                data: {
                  name: dedicatedGroupName,
                  commissionPercentage: 2,
                  tag: null,
                  createdById: amId,
                },
                select: { id: true, name: true, commissionPercentage: true },
              });
              await tx.user.update({
                where: { id: promotedUser.id },
                data: { chatterGroupId: fallbackGroup.id },
              });
              return { group: fallbackGroup, created: true };
            }
            throw error;
          }
        }
        return { group: byName, created: false };
      }

      // No group found — create the dedicated one.
      const newGroup = await tx.chatterGroup.create({
        data: {
          name: dedicatedGroupName,
          commissionPercentage: 2,
          tag: null,
          createdById: amId,
        },
        select: { id: true, name: true, commissionPercentage: true },
      });
      await tx.user.update({
        where: { id: promotedUser.id },
        data: { chatterGroupId: newGroup.id },
      });
      return { group: newGroup, created: true };
    });

    if (created) {
      console.info("[ensureInfluencerGroup] dedicated group created", {
        referralId: id,
        userId: promotedUser.id,
        groupId: group.id,
        groupName: group.name,
      });
    }

    return res.json({ success: true, group, created });
  } catch (error) {
    console.error("ensureInfluencerGroup error:", error);
    return res.status(500).json({ error: "Failed to ensure chatter group" });
  }
};

/**
 * sendReferralWelcomeEmail
 *
 * Send (or resend) the promoter welcome email. On first send it promotes
 * the PreUser to a real User and stamps `welcomeEmailSentAt`.
 *
 * The helper is best-effort on the email-send step but never throws, so
 * a transient SES failure surfaces here as `emailSent: false` and the
 * AM can simply click again.
 */
export const sendReferralWelcomeEmail = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res
        .status(loaded.error.code)
        .json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    if (
      user.role !== UserRole.ADMIN &&
      user.userType !== UserType.ACCOUNT_MANAGER
    ) {
      return res.status(403).json({
        error:
          "Access denied: only account managers or admins can send welcome emails",
      });
    }

    if (!referral.preUser) {
      return res.status(400).json({
        error:
          "This invite has no TeaseMe pre-influencer attached yet — the user hasn't started onboarding.",
      });
    }

    // Welcome email is only meaningful once the influencer is published /
    // LP Live. Earlier steps would create a User
    // before the upstream lifecycle has caught up, which is what we
    // explicitly moved away from when removing the auto-promote hook.
    if (
      !isPreUserPublished(referral.preUser.currentStep, referral.preUser.status)
    ) {
      return res.status(400).json({
        error:
          "The landing page must be live before the welcome email can be sent.",
      });
    }

    const wasAlreadySent = !!referral.preUser.welcomeEmailSentAt;

    const result = await promotePreUserToUser(prisma, {
      id: referral.preUser.id,
      email: referral.preUser.email,
      inviteCode: referral.preUser.inviteCode,
      referralId: referral.preUser.referralId,
      referrerId: referral.referrerId,
      welcomeEmailSentAt: referral.preUser.welcomeEmailSentAt,
      // Operator-initiated send / resend. Bypasses BOTH the in-memory and
      // DB-side anti-double-email guards inside the helper so a click on
      // "Resend Welcome Email" reissues a fresh set-password / invite
      // token and delivers a new email. The previous plaintext password
      // can't be recovered (bcrypt is one-way), so a true "resend the
      // same password" isn't possible here anyway.
      forceResend: true,
    });

    if (result.status === "error") {
      return res.status(500).json({
        error: result.error ?? "Failed to send welcome email",
      });
    }

    // The helper only returns `already_user` when an operator has NOT
    // requested a resend (forceResend is false). Since the controller
    // always sets forceResend=true for this AM-driven action, the
    // promoter's password is rotated and the welcome email is re-sent
    // even if they had previously chosen their own password. We surface
    // any unexpected `already_user` here as a 500 so we know the helper
    // contract drifted.
    if (result.status === "already_user") {
      console.error(
        "[send-welcome-email] unexpected already_user result with forceResend=true",
        { referralId: id, preUserId: referral.preUser.id },
      );
      return res.status(500).json({
        error: "Unexpected state while sending welcome email",
      });
    }

    // Echo the freshly stamped flag so the frontend can flip the button
    // label from "Send Welcome Email" to "Resend Welcome Email" without
    // a full list re-fetch.
    const updated = await prisma.referral.findUnique({
      where: { id: referral.preUser.id },
      select: { welcomeEmailSentAt: true },
    });

    return res.json({
      success: true,
      mode: wasAlreadySent ? "resent" : "sent",
      emailSent: result.emailSent ?? false,
      welcomeEmailSentAt: updated?.welcomeEmailSentAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Send welcome email error:", error);
    return res.status(500).json({ error: "Failed to send welcome email" });
  }
};

export const getReferralByInviteCode = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { inviteCode } = req.params;

    const referral = await prisma.referral.findUnique({
      where: { inviteCode },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            websiteUrl: true,
            commissionRate: true,
            isActive: true,
          },
        },
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Invalid invite code" });
    }

    if (referral.referredUserId) {
      return res
        .status(400)
        .json({ error: "This invite code has already been used" });
    }

    if (!referral.campaign.isActive) {
      return res
        .status(400)
        .json({ error: "This campaign is no longer active" });
    }

    res.json({ referral });
  } catch (error) {
    console.error("Get referral error:", error);
    res.status(500).json({ error: "Failed to fetch referral" });
  }
};

export const getMyReferrals = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    // Get the current user's username + inviteCode. `username` is used to
    // filter customer-tracking referrals out of the list (below); the pair
    // `{ username, inviteCode }` is also used to reconstruct each pending
    // row's `inviteUrl` via the same logic as `createReferralInvite`.
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true, inviteCode: true },
    });

    const isAccountManager = user.userType === UserType.ACCOUNT_MANAGER;

    let referralScopeIds: string[] | null = null;
    if (isAccountManager) {
      const idRows = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT DISTINCT r.id
          FROM referrals r
          WHERE r."referrerId" = ${user.id}
             OR (
               r.metadata IS NOT NULL
               AND LOWER(TRIM(r.metadata::jsonb->>'accountManagerEmail')) = LOWER(TRIM(${user.email}))
             )
        `,
      );
      referralScopeIds = idRows.map((r) => r.id);
    }

    let referralWhere: Prisma.ReferralWhereInput;
    if (referralScopeIds === null) {
      referralWhere = { referrerId: user.id };
    } else if (referralScopeIds.length > 0) {
      referralWhere = { id: { in: referralScopeIds } };
    } else {
      referralWhere = { referrerId: user.id };
    }

    const allReferrals = await prisma.referral.findMany({
      where: referralWhere,
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
            defaultReferralUrl: true,
            commissionRate: true,
            visibleToPromoters: true,
            linkedCampaignId: true,
          },
        },
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            username: true,
            inviteCode: true,
          },
        },
        referredUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            profilePhotoKey: true,
            createdAt: true,
            // Drives Send/Resend Welcome Email visibility on LP Live
            // cards: button hides once the promoter has completed
            // /first-password-change (mustChangePassword flips to false).
            mustChangePassword: true,
            chatterGroupId: true,
            chatterGroup: {
              select: {
                _count: { select: { members: true } },
              },
            },
          },
        },
        childReferrals: {
          include: {
            referredUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
                profilePhotoKey: true,
              },
            },
            commissions: {
              select: {
                id: true,
                amount: true,
                status: true,
                createdAt: true,
                userId: true,
              },
            },
          },
        },
        commissions: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            userId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Attach product onboarding cache as `preUser` DTO (API compat), then
    // refresh TeaseMe snapshots that are past TTL. Sugar is webhook-only.
    const referralsWithOnboarding = allReferrals.map(attachOnboardingView);
    await refreshPreUserSteps(referralsWithOnboarding);

    // Backfill: for any PENDING referral already in the published/live state
    // whose promoter User already exists in the DB, accept the referral
    // (PENDING → ACTIVE) so the card flips to LP Live via referral.status.
    // Group creation is NOT done here; this backfill only updates referral
    // state. Default chatter groups may be created via the explicit AM button
    // (POST /referrals/:id/ensure-group) or other lifecycle flows elsewhere,
    // and avoiding creation here helps prevent race-condition duplicates when
    // this endpoint is called multiple times in quick succession.
    backfillPendingPublishedReferrals(user.id, referralsWithOnboarding);
    repairDuplicateInviteeReferrals(user.id, referralsWithOnboarding);

    // Filter out:
    // 1. Self-referrals (referredUserId === own id, e.g. username-based tracking records)
    // 2. Customer tracking referrals (inviteCode === username or starts with username_)
    const filteredReferrals = referralsWithOnboarding.filter((ref) => {
      // Remove self-referrals entirely
      if (ref.referredUserId === user.id) return false;

      // Hide public "customer tracking" shell rows from My Promoters — they are
      // ACTIVE rows with `referredUserId: null` and no person invite in
      // metadata. Keep legacy pending invites visible even if they predate the
      // email-required flow and therefore have no `inviteeEmail`.
      const meta = readReferralMetadata(ref.metadata);
      if (
        ref.status === "ACTIVE" &&
        ref.referredUserId === null &&
        !meta.inviteeEmail
      )
        return false;

      // Remove username-based tracking records that are still pending
      if (ref.referredUserId === null && userDetails?.username) {
        return (
          ref.inviteCode !== userDetails.username &&
          !ref.inviteCode.startsWith(`${userDetails.username}_`)
        );
      }
      return true;
    });

    const referrals = dedupeReferralsByPromoter(filteredReferrals);

    // Presign every unique profile photo key once, then swap the stable S3 key
    // for a short-lived URL (1h) on each referredUser before responding.
    // The DB never stores the URL; the key is the only persistent reference.
    const photoKeys = new Set<string>();
    for (const ref of referrals) {
      if (ref.referredUser?.profilePhotoKey)
        photoKeys.add(ref.referredUser.profilePhotoKey);
      for (const cr of ref.childReferrals) {
        if (cr.referredUser?.profilePhotoKey)
          photoKeys.add(cr.referredUser.profilePhotoKey);
      }
    }
    const photoUrlByKey = new Map<string, string | null>();
    await Promise.all(
      Array.from(photoKeys).map(async (key) => {
        photoUrlByKey.set(key, await getPresignedUrl(key));
      }),
    );
    const hydrateReferredUser = <
      T extends {
        profilePhotoKey?: string | null;
        chatterGroup?: { _count: { members: number } } | null;
      } | null | undefined,
    >(
      ru: T,
    ):
      | (Omit<NonNullable<T>, "profilePhotoKey" | "chatterGroup"> & {
          photoUrl: string | null;
          chatterGroupMemberCount: number;
        })
      | null => {
      if (!ru) return null;
      const { profilePhotoKey, chatterGroup, ...rest } = ru;
      return {
        ...rest,
        photoUrl: profilePhotoKey
          ? (photoUrlByKey.get(profilePhotoKey) ?? null)
          : null,
        chatterGroupMemberCount: chatterGroup?._count.members ?? 0,
      };
    };
    // Same ref-code derivation used in `createReferralInvite`. Used below to
    // rebuild `inviteUrl` for pending rows so the UI can offer a "Copy link"
    // action without hitting the server again.
    const callerRefCode =
      userDetails?.username || userDetails?.inviteCode || user.id;

    const hydratedReferrals = referrals.map((ref) => {
      const metadata = readReferralMetadata(ref.metadata);
      const isExpired = computeIsExpired(ref.status, ref.createdAt, metadata);
      const refCodeForInvite =
        ref.referrerId === user.id
          ? callerRefCode
          : ref.referrer?.username ||
            ref.referrer?.inviteCode ||
            ref.referrer?.id ||
            callerRefCode;
      // Only pending rows need an inviteUrl — accepted rows already have a
      // `referredUser` so the UI wouldn't show the "Copy link" action. We
      // skip rows missing inviteeEmail (legacy invites created before the
      // email-required change) so we never emit a broken URL.
      const inviteUrl =
        ref.status === "PENDING" &&
        metadata.inviteeEmail &&
        metadata.inviterEmail
          ? buildInviteUrl(ref.campaign, {
              refCode: refCodeForInvite,
              inviteCode: ref.inviteCode,
              inviteeEmail: metadata.inviteeEmail,
              inviterEmail: metadata.inviterEmail,
              accountManagerEmail: metadata.accountManagerEmail ?? null,
            })
          : null;

      return {
        ...ref,
        metadata,
        isExpired,
        inviteUrl,
        preUser: ref.preUser
          ? {
              ...ref.preUser,
              assetLink: landingPageOnCampaignUrl(
                ref.preUser.assetLink,
                ref.campaign,
              ),
            }
          : ref.preUser,
        referredUser: hydrateReferredUser(ref.referredUser),
        childReferrals: ref.childReferrals.map((cr) => ({
          ...cr,
          referredUser: hydrateReferredUser(cr.referredUser),
        })),
      };
    });

    // Calculate earnings
    const paidEarnings = referrals.reduce((sum, ref) => {
      return (
        sum +
        ref.commissions
          .filter((comm) => comm.status === "paid")
          .reduce((commSum, comm) => commSum + comm.amount, 0)
      );
    }, 0);

    const totalEarnings = referrals.reduce((sum, ref) => {
      return (
        sum +
        ref.commissions.reduce((commSum, comm) => commSum + comm.amount, 0)
      );
    }, 0);

    res.json({
      referrals: hydratedReferrals,
      totalEarnings,
      paidEarnings,
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter((r) => r.status === "ACTIVE").length,
    });
  } catch (error) {
    console.error("Get my referrals error:", error);
    res.status(500).json({ error: "Failed to fetch referrals" });
  }
};

export const getReferralById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        campaign: true,
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        referredUser: {
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
        childReferrals: {
          include: {
            referredUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        commissions: true,
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Referral not found" });
    }

    // Inviter, invitee, admin, or assigned account manager.
    if (
      user.role !== UserRole.ADMIN &&
      referral.referrerId !== user.id &&
      referral.referredUserId !== user.id &&
      !(
        user.userType === UserType.ACCOUNT_MANAGER &&
        assignedAccountManagerMatchesUser(referral.metadata, user.email)
      )
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ referral });
  } catch (error) {
    console.error("Get referral error:", error);
    res.status(500).json({ error: "Failed to fetch referral" });
  }
};

export const generateTrackingLink = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { campaignId } = req.body;
    const userId = req.user!.id;

    // Get full user with username
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // A user can only have one tracking link per campaign (conceptually
    // "unique URLs for each user/campaign combination" per the schema). If
    // one already exists we return it instead of failing with a P2002 — the
    // `shortCode` column is globally unique and is derived from the user's
    // username, so re-creating would violate the constraint.
    const trackingLinkInclude = {
      campaign: {
        select: { id: true, name: true, websiteUrl: true },
      },
      user: {
        select: { id: true, username: true, email: true },
      },
    } as const;

    const existingTrackingLink = await prisma.trackingLink.findFirst({
      where: { userId: user.id, campaignId },
      include: trackingLinkInclude,
    });

    if (existingTrackingLink) {
      return res.status(200).json({
        trackingLink: existingTrackingLink,
        message: "Existing tracking link returned",
      });
    }

    // Preferred short code: username (fallback to user.id if no username).
    // The `shortCode` column is globally unique, so if it's already taken by
    // this user's tracking link on a different campaign we fall back to a
    // campaign-scoped code (`<base>-<nanoid>`) instead of returning an
    // unrelated campaign's row.
    const baseShortCode = user.username || user.id;

    // Get campaign website URL
    const campaignWebsiteUrl =
      campaign.websiteUrl || campaign.defaultReferralUrl;
    if (!campaignWebsiteUrl) {
      return res.status(400).json({ error: "Campaign URL not configured" });
    }

    const buildFullUrl = (code: string) => {
      const urlObj = new URL(campaignWebsiteUrl);
      urlObj.searchParams.set("fpr", code);
      return urlObj.toString();
    };

    const createTrackingLinkWith = (shortCode: string) =>
      prisma.trackingLink.create({
        data: {
          shortCode,
          fullUrl: buildFullUrl(shortCode),
          userId: user.id,
          campaignId,
        },
        include: trackingLinkInclude,
      });

    const isUniqueViolation = (err: unknown) =>
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002";

    try {
      const trackingLink = await createTrackingLinkWith(baseShortCode);
      return res.status(201).json({
        trackingLink,
        message: "Tracking link created successfully",
      });
    } catch (createError: unknown) {
      if (!isUniqueViolation(createError)) {
        throw createError;
      }

      // Concurrent creation for the exact same (user, campaign) pair — return
      // that row so the caller still gets the correct per-campaign link.
      const concurrentExisting = await prisma.trackingLink.findFirst({
        where: { userId: user.id, campaignId },
        include: trackingLinkInclude,
      });

      if (concurrentExisting) {
        return res.status(200).json({
          trackingLink: concurrentExisting,
          message: "Existing tracking link returned",
        });
      }

      // `shortCode` is taken by this user's link on a different campaign.
      // Retry once with a campaign-scoped suffix so each campaign gets its
      // own working tracking link — never return a foreign-campaign row.
      const scopedShortCode = `${baseShortCode}-${nanoid(6)}`;

      try {
        const trackingLink = await createTrackingLinkWith(scopedShortCode);
        return res.status(201).json({
          trackingLink,
          message: "Tracking link created successfully",
        });
      } catch (retryError: unknown) {
        // Extremely unlikely — scoped collision. Surface as 409 rather than
        // silently returning an unrelated row.
        if (isUniqueViolation(retryError)) {
          return res.status(409).json({
            error: "Tracking link already exists for this campaign",
          });
        }
        throw retryError;
      }
    }
  } catch (error) {
    console.error("Generate tracking link error:", error);
    res.status(500).json({ error: "Failed to generate tracking link" });
  }
};

export const getMyTrackingLinks = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    const trackingLinks = await prisma.trackingLink.findMany({
      where: { userId: user.id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
          },
        },
        _count: {
          select: { clickTracking: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ trackingLinks });
  } catch (error) {
    console.error("Get tracking links error:", error);
    res.status(500).json({ error: "Failed to fetch tracking links" });
  }
};

export const trackClick = async (req: AuthRequest, res: Response) => {
  try {
    const { shortCode, ipAddress, userAgent, referrerUrl } = req.body;

    const trackingLink = await prisma.trackingLink.findUnique({
      where: { shortCode },
      include: { campaign: true },
    });

    if (!trackingLink) {
      return res.status(404).json({ error: "Tracking link not found" });
    }

    // Create click tracking record
    await prisma.clickTracking.create({
      data: {
        trackingLinkId: trackingLink.id,
        userId: trackingLink.userId,
        ipAddress,
        userAgent,
        referrerUrl,
      },
    });

    // Increment click count
    await prisma.trackingLink.update({
      where: { id: trackingLink.id },
      data: { clicks: { increment: 1 } },
    });

    // Return the campaign website URL to redirect to
    res.json({
      redirectUrl: trackingLink.campaign.websiteUrl,
      campaignName: trackingLink.campaign.name,
    });
  } catch (error) {
    console.error("Track click error:", error);
    res.status(500).json({ error: "Failed to track click" });
  }
};

export const checkInviteQuota = async (req: AuthRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const user = req.user!;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const isAdminCaller = user.role === UserRole.ADMIN;
    const isAmCaller = hasAccountManagerAccess(user);

    // Always compute real usage for this month so all response branches
    // (including the admin/AM exemption) report accurate numbers for the UI
    // and for debugging/reporting tools.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const user_username = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true },
    });

    const invitesThisMonth = await prisma.referral.count({
      where: {
        referrerId: user.id,
        campaignId: campaign.id,
        inviteCode: { not: user_username?.username || "no-match" },
        createdAt: { gte: startOfMonth },
      },
    });

    const nextResetDate = new Date(
      startOfMonth.getFullYear(),
      startOfMonth.getMonth() + 1,
      1,
    ).toISOString();

    const maxInvitesPerMonth = campaign.maxInvitesPerMonth;
    const hasFiniteLimit =
      typeof maxInvitesPerMonth === "number" && maxInvitesPerMonth > 0;
    const isUnlimited = isAdminCaller || isAmCaller || !hasFiniteLimit;

    if (isUnlimited) {
      return res.json({
        campaignId: campaign.id,
        campaignName: campaign.name,
        limit: null,
        used: invitesThisMonth,
        remaining: null,
        status: "unlimited",
        message: "You have unlimited invites on this campaign",
        nextResetDate,
        quota: {
          used: invitesThisMonth,
          remaining: null,
          unlimited: true,
        },
      });
    }

    const limit = maxInvitesPerMonth ?? 0;
    const remaining = limit - invitesThisMonth;
    const isBlocked = remaining <= 0;
    const safeRemaining = Math.max(0, remaining);

    return res.json({
      campaignId: campaign.id,
      campaignName: campaign.name,
      limit,
      used: invitesThisMonth,
      remaining: safeRemaining,
      status: isBlocked ? "blocked" : "available",
      message: isBlocked
        ? `Monthly invite limit reached. Try again next month.`
        : `You have ${remaining} invite${remaining === 1 ? "" : "s"} remaining this month`,
      nextResetDate,
      quota: {
        used: invitesThisMonth,
        remaining: safeRemaining,
        unlimited: false,
      },
    });
  } catch (error) {
    console.error("Check invite quota error:", error);
    res.status(500).json({ error: "Failed to check invite quota" });
  }
};

// ─── Webhook: receive step-change push from TeaseMe ──────────────────────────

/**
 * POST /api/webhooks/teaseme-step
 *
 * Called by TeaseMe / Sugar whenever product onboarding step changes.
 * Validates the shared secret, patches Referral.onboarding while the invite
 * is still PENDING, then fires stepEmitter for open SSE streams. Settled
 * invites (ACTIVE / referredUser set) skip the write so late events cannot
 * restore a cache cleared by /register. No JWT — webhook secret only.
 */
export const receiveTeasemeStepWebhook = async (
  req: Request,
  res: Response,
) => {
  const expectedSecret = process.env.TEASEME_WEBHOOK_SECRET;
  const rawHeader = req.headers["x-webhook-secret"];
  const receivedSecret = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const isValid =
    !!expectedSecret &&
    !!receivedSecret &&
    expectedSecret.length === receivedSecret.length &&
    timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(receivedSecret));
  if (!isValid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    email,
    inviteCode,
    currentStep,
    status,
    referralId,
    assetLink,
    surveyLink,
  } = req.body as {
    email?: string;
    inviteCode?: string;
    currentStep?: number;
    status?: string;
    referralId?: string;
    assetLink?: string;
    surveyLink?: string;
  };

  if (!email || typeof currentStep !== "number") {
    return res
      .status(400)
      .json({ error: "email and currentStep are required" });
  }

  try {
    // Prefer inviteCode so an upstream email edit mid-flow does not attach
    // the step update to the wrong invite. Fall back to a case-insensitive
    // metadata/onboarding email match (no take:5 / equals casing traps).
    const referralWebhookSelect = {
      ...referralOnboardingSelect,
      status: true,
      referredUserId: true,
      campaign: { select: { name: true } },
    } as const;

    let referralRow = inviteCode
      ? await prisma.referral.findUnique({
          where: { inviteCode },
          select: referralWebhookSelect,
        })
      : null;

    if (!referralRow && email) {
      const byEmailId = await findReferralIdByInviteeEmail(prisma, email);
      referralRow = byEmailId
        ? await prisma.referral.findUnique({
            where: { id: byEmailId },
            select: referralWebhookSelect,
          })
        : null;
    }

    if (!referralRow) {
      console.warn("[teaseme-webhook] no Referral found", { email, inviteCode });
      return res.status(200).json({ ok: true, matched: false });
    }

    const preUser = toOnboardingView(referralRow);
    const resolvedReferralId = referralRow.id;
    const sugarCampaign = isSugarScratchCampaign(referralRow.campaign?.name);

    if (referralId && referralId !== resolvedReferralId) {
      console.warn(
        "[teaseme-webhook] ignoring mismatched referralId from request",
        {
          preUserId: preUser.id,
          email,
          requestReferralId: referralId,
          dbReferralId: resolvedReferralId,
        },
      );
    }

    // Invite already accepted (or cancelled): /register clears onboarding and
    // the Referral/User pair is source of truth. Do not rewrite the cache —
    // that used to be a no-op when PreUser was deleted; restoring a pending
    // snapshot makes My Promoters show Waiting on an ACTIVE invite.
    if (referralRow.status !== "PENDING" || referralRow.referredUserId) {
      console.info("[teaseme-webhook] skipping onboarding write; invite settled", {
        referralId: resolvedReferralId,
        status: referralRow.status,
        referredUserId: referralRow.referredUserId,
        email,
        inviteCode,
      });
      return res.status(200).json({ ok: true, matched: true, skipped: "settled" });
    }

    const alreadyPublished = isPreUserPublished(
      preUser.currentStep,
      preUser.status,
    );
    // Pack-not-ready rewinds (step 2 → 1) are valid before LP live. Once
    // published, a late Sugar step-2 webhook must not drop the card off live.
    const appliedStep = alreadyPublished
      ? Math.max(preUser.currentStep, currentStep)
      : currentStep;
    const appliedStatus = status
      ? chooseForwardStatus(preUser.status, status)
      : preUser.status;

    await patchReferralOnboarding(prisma, resolvedReferralId, {
      currentStep: appliedStep,
      status: appliedStatus,
      ...(typeof assetLink === "string" && assetLink ? { assetLink } : {}),
      ...(typeof surveyLink === "string" && surveyLink ? { surveyLink } : {}),
      // Sugar is webhook-driven only — keep lastCheckedAt so we do not
      // schedule a TeaseMe poll. TeaseMe still wants a fresh poll.
      lastCheckedAt: sugarCampaign ? preUser.lastCheckedAt : null,
      // Pack-not-ready rewinds before publish; never rewind after live.
      allowStepRewind:
        !alreadyPublished && appliedStep < preUser.currentStep,
    });

    console.info("[teaseme-webhook] step updated", {
      preUserId: preUser.id,
      email,
      currentStep: appliedStep,
      requestedStep: currentStep,
      status: appliedStatus,
      assetLink: assetLink ?? null,
      surveyLink: surveyLink ?? null,
      referralId: resolvedReferralId,
      sugarCampaign,
    });

    const emittedStatus = appliedStatus;
    if (resolvedReferralId) {
      stepEmitter.emit(`step:${resolvedReferralId}`, {
        currentStep: appliedStep,
        status: emittedStatus,
        done: isPreUserPublished(appliedStep, emittedStatus),
      });
    }

    // Respond immediately — don't block TeaseMe on our upstream poll.
    res.status(200).json({ ok: true, matched: true });

    // Background: when the invite reaches the published/live state, if a User
    // already exists for this email (e.g. created via the FirstPromoter API
    // before the welcome email was sent), accept the parent referral and
    // auto-create the default ChatterGroup without waiting for the AM to click
    // "Send Welcome Email".
    if (isPreUserPublished(appliedStep, emittedStatus)) {
      void (async () => {
        try {
          const promotedUser = await prisma.user.findFirst({
            where: {
              email: { equals: preUser.email, mode: "insensitive" },
            },
            select: {
              id: true,
              firstName: true,
              username: true,
              chatterGroupId: true,
              accountManagerId: true,
            },
          });
          if (!promotedUser) return; // no User yet — "Send Welcome Email" will handle it

          // Accept the referral if it is still PENDING so the card flips to
          // LP Live via referral.status rather than preUser.currentStep alone.
          if (resolvedReferralId) {
            const accepted = await prisma.referral.updateMany({
              where: { id: resolvedReferralId, status: "PENDING" },
              data: {
                referredUserId: promotedUser.id,
                status: "ACTIVE",
                acceptedAt: new Date(),
              },
            });
            if (accepted.count > 0) {
              console.info("[teaseme-webhook] referral accepted on published step", {
                currentStep: appliedStep,
                preUserId: preUser.id,
                referralId: resolvedReferralId,
                userId: promotedUser.id,
              });
              try {
                await supersedeDuplicateInviteeReferrals(prisma, {
                  keepReferralId: resolvedReferralId,
                  promotedUserId: promotedUser.id,
                });
              } catch (err) {
                console.error("[teaseme-webhook] duplicate referral cleanup failed", {
                  referralId: resolvedReferralId,
                  userId: promotedUser.id,
                  err: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }

          // Auto-create the dedicated ChatterGroup if the user doesn't
          // already have one named "{name} - Group". If they are linked to
          // a generic/manually-assigned group, we still create the dedicated
          // one and move them to it.
          //
          // TeaseMe username lookup is TeaseMe-only. Sugar Scratchie has no
          // TeaseMe record — fall back to the local username / first name.
          let teasemeUsername: string | null = null;
          if (!sugarCampaign) {
            try {
              const stepStatus = await fetchTeasemePreUserStatus({
                email: preUser.email,
                inviteCode: preUser.inviteCode ?? undefined,
              });
              teasemeUsername = stepStatus?.username ?? null;
            } catch {
              // Non-fatal — fall back to DB username below.
            }
          }

          const influencerName =
            teasemeUsername ||
            promotedUser.username ||
            promotedUser.firstName ||
            preUser.email.split("@")[0];
          const dedicatedGroupName = `${influencerName} - Group`;

          // Atomic find-or-create: check user's current group, then search
          // by name, then create only if absent. Prevents duplicates when the
          // webhook fires concurrently with the "Assign Chatters" button.
          const { accountManagerId: amFromChain } = await resolveOwnership(
            prisma,
            resolvedReferralId,
          );
          const amId = amFromChain ?? promotedUser.accountManagerId ?? null;

          if (!amId) {
            console.warn(
              "[teaseme-webhook] published invite: no AM resolved; skipping default chatter group",
              { preUserId: preUser.id, userId: promotedUser.id },
            );
            return;
          }

          await prisma.$transaction(async (tx) => {
            // Fast-path: already linked to the dedicated group.
            if (promotedUser.chatterGroupId) {
              const linked = await tx.chatterGroup.findUnique({
                where: { id: promotedUser.chatterGroupId },
                select: { id: true, name: true },
              });
              if (linked?.name === dedicatedGroupName) return;
            }

            const createAndLinkDedicatedGroup = async () => {
              const group = await tx.chatterGroup.create({
                data: {
                  name: dedicatedGroupName,
                  commissionPercentage: 2,
                  tag: null,
                  createdById: amId,
                },
                select: { id: true },
              });
              await tx.user.update({
                where: { id: promotedUser.id },
                data: { chatterGroupId: group.id },
              });
              console.info("[teaseme-webhook] default chatter group created on published invite", {
                preUserId: preUser.id,
                userId: promotedUser.id,
                groupId: group.id,
                groupName: dedicatedGroupName,
                createdById: amId,
              });
            };

            // Adopt an existing safe unlinked group with this name if one already exists.
            const byName = await tx.chatterGroup.findFirst({
              where: {
                name: dedicatedGroupName,
                promoter: null,
              },
              select: { id: true },
            });
            if (byName) {
              if (promotedUser.chatterGroupId !== byName.id) {
                try {
                  await tx.user.update({
                    where: { id: promotedUser.id },
                    data: { chatterGroupId: byName.id },
                  });
                } catch (error) {
                  if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2002"
                  ) {
                    await createAndLinkDedicatedGroup();
                    return;
                  }
                  throw error;
                }
              }
              return;
            }

            // Create the dedicated group.
            await createAndLinkDedicatedGroup();
          });
        } catch (err) {
          console.error(
            "[teaseme-webhook] published invite chatter group / referral acceptance failed",
            { preUserId: preUser.id, err: err instanceof Error ? err.message : String(err) },
          );
        }
      })();
    }

    // Background: poll TeaseMe /step-progress for surveyLink / assetLink.
    // Sugar Scratchie never uses TeaseMe — its LP URL arrives on the webhook
    // body. Also skip once the invite is already published/live (Sugar step 3
    // or TeaseMe published step), even when currentStep < PUBLISHED_SURVEY_STEP.
    if (
      !sugarCampaign &&
      !isPreUserPublished(appliedStep, emittedStatus) &&
      appliedStep < PUBLISHED_SURVEY_STEP
    ) {
      void fetchTeasemePreUserStatus({
        email: preUser.email,
        inviteCode: preUser.inviteCode ?? undefined,
      })
        .then(async (freshStatus) => {
          if (!freshStatus) return;
          const freshSurveyLink =
            freshStatus.surveyLink &&
            !freshStatus.surveyLink.includes("inviteCode=")
              ? freshStatus.surveyLink
              : null;
          const freshAssetLink = freshStatus.assetLink ?? null;
          if (!freshSurveyLink && !freshAssetLink) return;
          await patchReferralOnboarding(prisma, preUser.id, {
            ...(freshSurveyLink ? { surveyLink: freshSurveyLink } : {}),
            ...(freshAssetLink ? { assetLink: freshAssetLink } : {}),
            lastCheckedAt: new Date(),
          });
          console.info("[teaseme-webhook] immediate poll saved links", {
            preUserId: preUser.id,
            surveyLink: freshSurveyLink,
            assetLink: freshAssetLink,
          });
          if (resolvedReferralId && (freshSurveyLink || freshAssetLink)) {
            stepEmitter.emit("step:" + resolvedReferralId, {
              currentStep: freshStatus.step,
              status: freshStatus.status ?? status ?? preUser.status,
              surveyLink: freshSurveyLink,
              assetLink: freshAssetLink,
              done: isPreUserPublished(
                freshStatus.step,
                freshStatus.status ?? status ?? preUser.status,
              ),
            });
          }
        })
        .catch((err) => {
          console.error("[teaseme-webhook] immediate poll failed", { err });
        });
    }
  } catch (error) {
    console.error("[teaseme-webhook] error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── SSE: stream step-progress updates to the browser ────────────────────────

/**
 * GET /api/referrals/:id/status-stream
 *
 * Opens a Server-Sent Events stream for a specific referral. The browser
 * keeps this connection open; when the TeaseMe webhook fires and updates the
 * stepEmitter, this handler pushes the new step data instantly. No polling.
 *
 * Auth: cookie-based JWT (authenticate middleware). The browser must pass
 * `withCredentials: true` when creating the EventSource.
 */
export const streamReferralStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  try {
    const referral = await prisma.referral.findUnique({
      where: { id },
      select: {
        id: true,
        referrerId: true,
        referredUserId: true,
        metadata: true,
        onboarding: true,
        onboardingCheckedAt: true,
        welcomeEmailSentAt: true,
        inviteCode: true,
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Referral not found" });
    }

    if (
      user.role !== UserRole.ADMIN &&
      referral.referrerId !== user.id &&
      referral.referredUserId !== user.id &&
      !(
        user.userType === UserType.ACCOUNT_MANAGER &&
        assignedAccountManagerMatchesUser(referral.metadata, user.email)
      )
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Set SSE headers — disable any compression middleware so chunks are
    // flushed immediately rather than buffered.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    const onboardingView = attachOnboardingView(referral).preUser;
    const currentStep = onboardingView?.currentStep ?? 0;
    const currentStatus = onboardingView?.status ?? "pending";
    const done = isPreUserPublished(currentStep, currentStatus);

    // Send the current step immediately so the browser has a starting value
    res.write(
      `data: ${JSON.stringify({ connected: true, currentStep, status: currentStatus, done })}\n\n`,
    );

    if (done) {
      return res.end();
    }

    const eventKey = `step:${referral.id}`;

    const onStep = (payload: {
      currentStep: number;
      status: string;
      done: boolean;
    }) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (payload.done) {
        res.end();
      }
    };

    stepEmitter.on(eventKey, onStep);

    // Cleanup when the browser closes the connection
    req.on("close", () => {
      stepEmitter.off(eventKey, onStep);
    });
  } catch (error) {
    console.error("Stream referral status error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to open status stream" });
    } else {
      res.end();
    }
  }
};

/** Admin-only overview of every account manager's referral tree + commission %. */
export const getAdminNetworkStructure = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const managers = await prisma.user.findMany({
      where: { userType: UserType.ACCOUNT_MANAGER, isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        referralsReceived: {
          where: { status: "ACTIVE" },
          select: {
            campaign: {
              select: {
                id: true,
                name: true,
                isActive: true,
                visibleToPromoters: true,
                commissionRate: true,
                secondaryRate: true,
                linkedCampaign: {
                  select: {
                    id: true,
                    name: true,
                    commissionRate: true,
                    secondaryRate: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    });

    if (managers.length === 0) {
      return res.json({ managers: [] });
    }

    const amIds = managers.map((m) => m.id);

    const scopeRows = await prisma.$queryRaw<Array<{ id: string; amId: string }>>(
      Prisma.sql`
        SELECT DISTINCT r.id, am.id AS "amId"
        FROM referrals r
        INNER JOIN users am
          ON am."userType" = 'ACCOUNT_MANAGER'
         AND am."isActive" = true
         AND am.id IN (${Prisma.join(amIds)})
        WHERE r."referrerId" = am.id
           OR (
             r.metadata IS NOT NULL
             AND LOWER(TRIM(r.metadata::jsonb->>'accountManagerEmail'))
               = LOWER(TRIM(am.email))
           )
      `,
    );

    const referralIdsByAm = new Map<string, Set<string>>();
    for (const row of scopeRows) {
      const set = referralIdsByAm.get(row.amId) ?? new Set<string>();
      set.add(row.id);
      referralIdsByAm.set(row.amId, set);
    }

    const allReferralIds = [...new Set(scopeRows.map((r) => r.id))];

    const shapeInviter = (user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      userType?: string | null;
    } | null) =>
      user
        ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType ?? null,
          }
        : null;

    const referrals =
      allReferralIds.length > 0
        ? await prisma.referral.findMany({
            where: { id: { in: allReferralIds } },
            include: {
              referrer: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  userType: true,
                },
              },
              campaign: {
                select: {
                  id: true,
                  name: true,
                  commissionRate: true,
                  secondaryRate: true,
                  visibleToPromoters: true,
                },
              },
              referredUser: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  username: true,
                  userType: true,
                  chatterGroup: {
                    select: {
                      id: true,
                      name: true,
                      commissionPercentage: true,
                      _count: { select: { members: true } },
                    },
                  },
                },
              },
              childReferrals: {
                where: { status: { in: ["ACTIVE", "PENDING"] } },
                select: {
                  id: true,
                  level: true,
                  status: true,
                  referredUser: {
                    select: {
                      id: true,
                      email: true,
                      firstName: true,
                      lastName: true,
                      username: true,
                      userType: true,
                      chatterGroup: {
                        select: {
                          id: true,
                          name: true,
                          commissionPercentage: true,
                          _count: { select: { members: true } },
                        },
                      },
                    },
                  },
                },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          })
        : [];

    const referralById = new Map(referrals.map((r) => [r.id, r]));

    const promoterRows = await prisma.user.findMany({
      where: {
        userType: { in: [UserType.PROMOTER, UserType.TEAM_MANAGER] },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userType: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
          },
        },
        chatterGroup: {
          select: {
            id: true,
            name: true,
            commissionPercentage: true,
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    });

    const amIdByPromoterId = await resolveAccountManagersFor(
      promoterRows.map((p) => p.id),
    );

    const promoterIds = promoterRows.map((p) => p.id);
    const inviteReferrals =
      promoterIds.length > 0
        ? await prisma.referral.findMany({
            where: {
              referredUserId: { in: promoterIds },
              status: { in: ["ACTIVE", "PENDING"] },
            },
            select: {
              id: true,
              referredUserId: true,
              level: true,
              status: true,
              referrer: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  userType: true,
                },
              },
              campaign: {
                select: {
                  id: true,
                  name: true,
                  commissionRate: true,
                  secondaryRate: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          })
        : [];

    const inviteByPromoterId = new Map<
      string,
      (typeof inviteReferrals)[number]
    >();
    for (const row of inviteReferrals) {
      if (!row.referredUserId) continue;
      if (!inviteByPromoterId.has(row.referredUserId)) {
        inviteByPromoterId.set(row.referredUserId, row);
      }
    }

    const shaped = managers.map((m) => {
      const membershipRows = m.referralsReceived.filter(
        (r) => r.campaign.isActive && !r.campaign.visibleToPromoters,
      );
      const hiddenCampaigns = membershipRows.map((r) => r.campaign);
      const publicCampaigns = Array.from(
        new Map(
          hiddenCampaigns
            .map((c) => c.linkedCampaign)
            .filter(
              (
                c,
              ): c is {
                id: string;
                name: string;
                commissionRate: number;
                secondaryRate: number | null;
                isActive: boolean;
              } => Boolean(c),
            )
            .map((c) => [c.id, c]),
        ).values(),
      );
      const hiddenCampaign = hiddenCampaigns[0] ?? null;
      const publicCampaign = publicCampaigns[0] ?? null;

      const scopedIds = referralIdsByAm.get(m.id) ?? new Set<string>();
      const scopedReferrals = [...scopedIds]
        .map((id) => referralById.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .filter((ref) => {
          if (ref.referredUserId === m.id) return false;
          const meta = readReferralMetadata(ref.metadata);
          if (
            ref.status === "ACTIVE" &&
            ref.referredUserId === null &&
            !meta.inviteeEmail
          ) {
            return false;
          }
          return ref.status === "ACTIVE" || ref.status === "PENDING";
        });

      const shapeChatterGroup = (
        group: {
          id: string;
          name: string;
          commissionPercentage: number;
          _count: { members: number };
        } | null,
      ) =>
        group
          ? {
              id: group.id,
              name: group.name,
              commissionPercentage: group.commissionPercentage,
              memberCount: group._count.members,
            }
          : null;

      const tree = scopedReferrals.map((ref) => ({
        id: ref.id,
        level: ref.level,
        status: ref.status,
        referrer: shapeInviter(ref.referrer),
        campaign: {
          id: ref.campaign.id,
          name: ref.campaign.name,
          commissionRate: ref.campaign.commissionRate,
          secondaryRate: ref.campaign.secondaryRate,
        },
        referredUser: ref.referredUser
          ? {
              id: ref.referredUser.id,
              email: ref.referredUser.email,
              firstName: ref.referredUser.firstName,
              lastName: ref.referredUser.lastName,
              username: ref.referredUser.username,
              userType: ref.referredUser.userType,
              chatterGroup: shapeChatterGroup(ref.referredUser.chatterGroup),
            }
          : null,
        inviteeEmail: readReferralMetadata(ref.metadata).inviteeEmail ?? null,
        children: ref.childReferrals.map((child) => ({
          id: child.id,
          level: child.level,
          status: child.status,
          referrer: ref.referredUser
            ? shapeInviter({
                id: ref.referredUser.id,
                email: ref.referredUser.email,
                firstName: ref.referredUser.firstName,
                lastName: ref.referredUser.lastName,
                userType: ref.referredUser.userType,
              })
            : shapeInviter(ref.referrer),
          referredUser: child.referredUser
            ? {
                id: child.referredUser.id,
                email: child.referredUser.email,
                firstName: child.referredUser.firstName,
                lastName: child.referredUser.lastName,
                username: child.referredUser.username,
                userType: child.referredUser.userType,
                chatterGroup: shapeChatterGroup(child.referredUser.chatterGroup),
              }
            : null,
        })),
      }));

      const promoterUsers = promoterRows
        .filter((p) => amIdByPromoterId.get(p.id) === m.id)
        .map((p) => {
          const invite = inviteByPromoterId.get(p.id);
          const referrerIsPromoter =
            invite?.referrer &&
            invite.referrer.userType !== UserType.ACCOUNT_MANAGER &&
            invite.referrer.id !== m.id;
          const invitedBy =
            (invite && invite.level >= 2 && referrerIsPromoter
              ? shapeInviter(invite.referrer)
              : null) ??
            shapeInviter(invite?.referrer ?? null) ??
            shapeInviter(p.createdBy);
          const tier =
            invite?.level ??
            (invitedBy?.id === m.id ||
            invitedBy?.userType === UserType.ACCOUNT_MANAGER
              ? 1
              : invitedBy
                ? 2
                : 1);

          return {
            id: p.id,
            email: p.email,
            firstName: p.firstName,
            lastName: p.lastName,
            userType: p.userType,
            chatterGroup: shapeChatterGroup(p.chatterGroup),
            invitedBy,
            tier,
            referralId: invite?.id ?? null,
            referralStatus: invite?.status ?? null,
            referralCampaign: invite?.campaign ?? null,
          };
        });

      const t1Count = promoterUsers.filter((p) => p.tier === 1).length;
      const t2Count = promoterUsers.filter((p) => p.tier === 2).length;

      const { referralsReceived: _drop, ...managerRest } = m;

      return {
        ...managerRest,
        promoterUsers,
        amPercent: hiddenCampaign?.secondaryRate ?? null,
        hiddenCampaigns: hiddenCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
        })),
        publicCampaigns,
        // First membership / linked public — kept for older UI readers.
        hiddenCampaign: hiddenCampaign
          ? { id: hiddenCampaign.id, name: hiddenCampaign.name }
          : null,
        publicCampaign: publicCampaign
          ? {
              id: publicCampaign.id,
              name: publicCampaign.name,
              commissionRate: publicCampaign.commissionRate,
              secondaryRate: publicCampaign.secondaryRate,
              isActive: publicCampaign.isActive,
            }
          : null,
        referrals: tree,
        stats: {
          t1Count,
          t2Count,
          activeCount: promoterUsers.length,
        },
      };
    });

    res.json({ managers: shaped });
  } catch (error) {
    console.error("Get admin network structure error:", error);
    res.status(500).json({ error: "Failed to fetch network structure" });
  }
};
