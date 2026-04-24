import { Prisma, PrismaClient, UserRole, UserType } from "@prisma/client";
import { Response } from "express";
import { validationResult } from "express-validator";
import { nanoid } from "nanoid";
import { AuthRequest } from "../middleware/auth.middleware";
import { emailService } from "../services/email.service";
import { getPresignedUrl } from "../services/s3.service";
import {
  denyPreInfluencer,
  fetchTeasemePreUserStatus,
  notifyChattersAssigned,
  orderLandingPageForPreInfluencer,
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

// Keep the audit trail from unbounded growth — a single invite should never
// accumulate more than this many step transitions in the stepHistory column.
const STEP_HISTORY_MAX = 20;

type StepHistoryEntry = { step: number; at: string };

const readStepHistory = (raw: Prisma.JsonValue | null | undefined): StepHistoryEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StepHistoryEntry =>
      !!e && typeof e === "object" && !Array.isArray(e) &&
      typeof (e as StepHistoryEntry).step === "number" &&
      typeof (e as StepHistoryEntry).at === "string",
  );
};

type PreUserRow = {
  id: string;
  email: string;
  inviteCode: string | null;
  currentStep: number;
  status: string;
  lastCheckedAt: Date | null;
  stepHistory: Prisma.JsonValue | null;
  teasemeUserId: string | null;
};

type ReferralRowWithPreUser = { preUser: PreUserRow | null };

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
            // Upstream miss / error — just bump lastCheckedAt so we don't
            // spin on the same row every list render.
            const updated = await prisma.preUser.update({
              where: { id: pre.id },
              data: { lastCheckedAt: nextCheckedAt },
              select: {
                id: true,
                email: true,
                inviteCode: true,
                currentStep: true,
                status: true,
                lastCheckedAt: true,
                stepHistory: true,
                teasemeUserId: true,
              },
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

          const updated = await prisma.preUser.update({
            where: { id: pre.id },
            data: {
              currentStep: status.step,
              // Mirror TeaseMe's lifecycle string into our own column so the
              // list endpoint can emit it without a second upstream call. If
              // upstream omits `status` we keep the last known value.
              status: status.status ?? pre.status,
              teasemeUserId: status.teasemeUserId ?? pre.teasemeUserId,
              lastCheckedAt: nextCheckedAt,
              stepHistory: nextHistory as unknown as Prisma.InputJsonValue,
            },
            select: {
              id: true,
              email: true,
              inviteCode: true,
              currentStep: true,
              status: true,
              lastCheckedAt: true,
              stepHistory: true,
              teasemeUserId: true,
            },
          });
          row.preUser = updated;
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

const hasAccountManagerAccess = (user: AuthRequest["user"]) => {
  return user?.userType === UserType.ACCOUNT_MANAGER;
};

// Referral.metadata is typed as Prisma.JsonValue. Narrow it to the shape we
// actually write so callers can read `inviteeEmail` / `expiresAt` / etc
// without repeating the type guard everywhere.
type ReferralMetadata = {
  accountManagerEmail?: string | null;
  inviterEmail?: string | null;
  inviteeEmail?: string | null;
  inviteCode?: string | null;
  emailSentAt?: string | null;
  expiresAt?: string | null;
  resendCount?: number;
};

const readReferralMetadata = (raw: Prisma.JsonValue | null | undefined): ReferralMetadata => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ReferralMetadata;
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

export const createReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { campaignId, email } = req.body;
    const user = req.user!;

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
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
      // Check if promoter is already part of this campaign (has been referred to it)
      const isParticipant = await prisma.referral.findFirst({
        where: {
          campaignId,
          OR: [{ referrerId: user.id }, { referredUserId: user.id }],
        },
      });

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

    // Determine referral level
    let level = 1;
    let parentReferralId = null;

    // If the user is an influencer, this is a second-level referral
    if (user.role === UserRole.PROMOTER) {
      // Find the referral where this user was referred
      const userReferral = await prisma.referral.findFirst({
        where: {
          campaignId,
          referredUserId: user.id,
        },
      });

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
    const accountManagerEmail: string | null = inviterIsAmOrAdmin
      ? inviter.email
      : inviter.accountManager?.email ?? null;

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

    // Create the Referral and seed a matching PreUser row atomically. The
    // PreUser tracks TeaseMe onboarding lifecycle (step 0..N) until the
    // invitee registers on our side, at which point the register handler
    // deletes it. Keeping both writes in one transaction guarantees we never
    // have a pending invite without its lifecycle row.
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

      await tx.preUser.create({
        data: {
          email: email as string,
          referralId: created.id,
          inviteCode,
          currentStep: 0,
        },
      });

      return created;
    });

    const refCode = inviter.username || inviter.inviteCode || user.id;
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
    try {
      emailSent = await emailService.sendReferralInviteEmail({
        inviteeEmail: email as string,
        inviterName,
        campaignName: referral.campaign.name,
        acceptUrl: inviteUrl,
      });
    } catch (emailError) {
      console.error("Referral invite email failed:", emailError);
      emailSent = false;
    }

    res.status(201).json({
      referral,
      inviteUrl,
      inviteCode,
      emailSent,
      message: "Referral invite created successfully",
    });
  } catch (error) {
    console.error("Create referral error:", error);
    res.status(500).json({ error: "Failed to create referral invite" });
  }
};

export const resendReferralInvite = async (
  req: AuthRequest,
  res: Response,
) => {
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
            websiteUrl: true,
            defaultReferralUrl: true,
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

    // Only the original inviter or an admin can resend. AMs can only resend
    // invites they themselves sent; we intentionally don't let arbitrary AMs
    // re-mail strangers on behalf of their promoters.
    if (user.role !== UserRole.ADMIN && referral.referrerId !== user.id) {
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

    // Force the next My Promoters load to re-poll tmapi immediately instead
    // of waiting for the normal TTL — a resend usually means the inviter
    // wants fresh status. Upsert so rows that pre-date this migration still
    // get a PreUser without requiring a backfill.
    await prisma.preUser.upsert({
      where: { referralId: referral.id },
      update: { lastCheckedAt: null },
      create: {
        email: inviteeEmail,
        referralId: referral.id,
        inviteCode: referral.inviteCode,
        currentStep: 0,
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
    try {
      emailSent = await emailService.sendReferralInviteEmail({
        inviteeEmail,
        inviterName,
        campaignName: referral.campaign.name,
        acceptUrl: inviteUrl,
      });
    } catch (emailError) {
      console.error("Referral invite resend failed:", emailError);
      emailSent = false;
    }

    return res.json({
      emailSent,
      inviteUrl,
      inviteeEmail,
      expiresAt: expiresAt.toISOString(),
      resendCount: nextMetadata.resendCount,
      message: emailSent
        ? "Invite email resent"
        : "Invite updated but email delivery failed",
    });
  } catch (error) {
    console.error("Resend referral invite error:", error);
    return res.status(500).json({ error: "Failed to resend invite" });
  }
};

export const deleteReferralInvite = async (
  req: AuthRequest,
  res: Response,
) => {
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
        _count: { select: { childReferrals: true } },
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Referral not found" });
    }

    // Only the original inviter or an admin can delete. Same rule as resend.
    if (user.role !== UserRole.ADMIN && referral.referrerId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Refuse to delete anything that has downstream state attached. Pending
    // and explicitly-denied (CANCELLED) invites are both safe to hard-delete
    // because neither has a referredUser attached — pending hasn't accepted
    // yet, denied was rejected before acceptance. Once a user has signed up
    // via the code we must keep the row for commission attribution + audit,
    // so ACTIVE / COMPLETED stay off-limits. Admins hit the same guard — if
    // this ever needs overriding, do it from the DB, not through this route.
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

    await prisma.referral.delete({ where: { id: referral.id } });

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
// caller. Only the original inviter (referrer) or an admin can act on these
// endpoints, matching the rule used by resend/delete.
const loadReferralForAction = async (
  id: string,
  user: NonNullable<AuthRequest["user"]>,
) => {
  const referral = await prisma.referral.findUnique({
    where: { id },
    include: {
      preUser: {
        select: {
          id: true,
          email: true,
          inviteCode: true,
          currentStep: true,
          status: true,
          lastCheckedAt: true,
          stepHistory: true,
          teasemeUserId: true,
        },
      },
      referredUser: {
        select: { id: true, email: true },
      },
    },
  });
  if (!referral) return { error: { code: 404, message: "Referral not found" } };
  if (user.role !== UserRole.ADMIN && referral.referrerId !== user.id) {
    return { error: { code: 403, message: "Access denied" } };
  }
  return { referral };
};

export const denyReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { reason } = (req.body ?? {}) as { reason?: string };

    const loaded = await loadReferralForAction(id, user);
    if (loaded.error) {
      return res.status(loaded.error.code).json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    if (referral.status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "Only pending referrals can be denied" });
    }

    // Fire upstream first so we don't flip local state if TeaseMe is down —
    // but don't block on it; a persisted INACTIVE here is still useful. A
    // null result just means upstream was unreachable; we log and proceed.
    const upstream = await denyPreInfluencer({
      inviteCode: referral.inviteCode,
      email: referral.preUser?.email,
      reason,
    });
    if (!upstream) {
      console.warn("[denyReferralInvite] upstream returned non-2xx", {
        referralId: referral.id,
      });
    }

    // Schema's ReferralStatus enum is PENDING|ACTIVE|COMPLETED|CANCELLED.
    // "Deny" maps to CANCELLED — we don't keep a separate soft-delete state.
    const updated = await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "CANCELLED" },
      select: { id: true, status: true },
    });

    return res.json({ success: true, referral: updated });
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
      return res.status(loaded.error.code).json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    // The new referrer must be an account manager — reassignment moves the
    // promoter between AMs, it's not a generic user swap.
    const newReferrer = await prisma.user.findFirst({
      where: { id: newReferrerId, userType: UserType.ACCOUNT_MANAGER },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!newReferrer) {
      return res.status(404).json({ error: "New account manager not found" });
    }

    const upstream = await reassignPreInfluencer({
      inviteCode: referral.inviteCode,
      email: referral.preUser?.email,
      newManagerEmail: newReferrer.email,
    });
    if (!upstream) {
      console.warn("[reassignReferralInvite] upstream returned non-2xx", {
        referralId: referral.id,
      });
      return res.status(502).json({
        error: "Failed to reassign referral in upstream service",
      });
    }

    const metadata = readReferralMetadata(referral.metadata);
    const nextMetadata = {
      ...metadata,
      accountManagerEmail: newReferrer.email,
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
    });
  } catch (error) {
    console.error("Reassign referral invite error:", error);
    return res.status(500).json({ error: "Failed to reassign referral" });
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
      return res.status(loaded.error.code).json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    if (!referral.preUser) {
      return res.status(400).json({
        error:
          "This invite has no TeaseMe pre-influencer attached yet — the user hasn't started onboarding.",
      });
    }

    const upstream = await orderLandingPageForPreInfluencer({
      inviteCode: referral.inviteCode,
      email: referral.preUser.email,
    });
    if (!upstream) {
      return res.status(502).json({
        error:
          "TeaseMe couldn't start the landing-page build right now. Please try again in a moment.",
      });
    }

    // Upstream may return the new `status` directly. If not, re-poll to get
    // the authoritative value instead of guessing.
    let nextStatus = upstream.status ?? null;
    let nextStep = referral.preUser.currentStep;
    let nextTeasemeId = referral.preUser.teasemeUserId;
    if (!nextStatus) {
      const polled = await fetchTeasemePreUserStatus({
        email: referral.preUser.email,
        inviteCode: referral.inviteCode,
      });
      if (polled) {
        nextStatus = polled.status ?? nextStatus;
        nextStep = polled.step;
        nextTeasemeId = polled.teasemeUserId ?? nextTeasemeId;
      }
    }

    const updatedPreUser = await prisma.preUser.update({
      where: { id: referral.preUser.id },
      data: {
        status: nextStatus ?? "building",
        currentStep: nextStep,
        teasemeUserId: nextTeasemeId,
        lastCheckedAt: new Date(),
      },
      select: {
        id: true,
        currentStep: true,
        status: true,
        lastCheckedAt: true,
        teasemeUserId: true,
      },
    });

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
      return res.status(loaded.error.code).json({ error: loaded.error.message });
    }
    const { referral } = loaded;

    // Assigning chatters only makes sense once the invitee has signed up —
    // otherwise there's no User row to link the group to.
    if (!referral.referredUser) {
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

        if (existingPromoter && existingPromoter.id !== referral.referredUser.id) {
          await tx.user.update({
            where: { id: existingPromoter.id },
            data: { chatterGroupId: null },
          });
        }

        await tx.user.update({
          where: { id: referral.referredUser.id },
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
      email: referral.referredUser.email,
      chatterGroupId: chatterGroup.id,
    });
    if (!upstream) {
      console.warn("[assignReferralChatters] upstream notify returned non-2xx", {
        referralId: referral.id,
      });
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

    const allReferrals = await prisma.referral.findMany({
      where: { referrerId: user.id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
            defaultReferralUrl: true,
            commissionRate: true,
          },
        },
        preUser: {
          select: {
            id: true,
            email: true,
            inviteCode: true,
            currentStep: true,
            status: true,
            lastCheckedAt: true,
            stepHistory: true,
            teasemeUserId: true,
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

    // Refresh TeaseMe lifecycle state for any stale PreUser rows before
    // shaping the response, so the UI sees the freshest possible "Step N"
    // chip. Mutates each ref.preUser in-place; no-op for rows already inside
    // TTL or for rows already registered (no PreUser attached).
    await refreshPreUserSteps(allReferrals);

    // Filter out:
    // 1. Self-referrals (referredUserId === own id, e.g. username-based tracking records)
    // 2. Customer tracking referrals (inviteCode === username or starts with username_)
    const referrals = allReferrals.filter(ref => {
      // Remove self-referrals entirely
      if (ref.referredUserId === user.id) return false;

      // Remove username-based tracking records that are still pending
      if (ref.referredUserId === null && userDetails?.username) {
        return ref.inviteCode !== userDetails.username && !ref.inviteCode.startsWith(`${userDetails.username}_`);
      }
      return true;
    });

    // Presign every unique profile photo key once, then swap the stable S3 key
    // for a short-lived URL (1h) on each referredUser before responding.
    // The DB never stores the URL; the key is the only persistent reference.
    const photoKeys = new Set<string>();
    for (const ref of referrals) {
      if (ref.referredUser?.profilePhotoKey) photoKeys.add(ref.referredUser.profilePhotoKey);
      for (const cr of ref.childReferrals) {
        if (cr.referredUser?.profilePhotoKey) photoKeys.add(cr.referredUser.profilePhotoKey);
      }
    }
    const photoUrlByKey = new Map<string, string | null>();
    await Promise.all(
      Array.from(photoKeys).map(async (key) => {
        photoUrlByKey.set(key, await getPresignedUrl(key));
      })
    );
    const hydrateReferredUser = <T extends { profilePhotoKey?: string | null } | null | undefined>(
      ru: T
    ): (Omit<NonNullable<T>, "profilePhotoKey"> & { photoUrl: string | null }) | null => {
      if (!ru) return null;
      const { profilePhotoKey, ...rest } = ru;
      return {
        ...rest,
        photoUrl: profilePhotoKey ? photoUrlByKey.get(profilePhotoKey) ?? null : null,
      } as Omit<NonNullable<T>, "profilePhotoKey"> & { photoUrl: string | null };
    };
    // Same ref-code derivation used in `createReferralInvite`. Used below to
    // rebuild `inviteUrl` for pending rows so the UI can offer a "Copy link"
    // action without hitting the server again.
    const callerRefCode =
      userDetails?.username || userDetails?.inviteCode || user.id;

    const hydratedReferrals = referrals.map((ref) => {
      const metadata = readReferralMetadata(ref.metadata);
      const isExpired = computeIsExpired(ref.status, ref.createdAt, metadata);
      // Only pending rows need an inviteUrl — accepted rows already have a
      // `referredUser` so the UI wouldn't show the "Copy link" action. We
      // skip rows missing inviteeEmail (legacy invites created before the
      // email-required change) so we never emit a broken URL.
      const inviteUrl =
        ref.status === "PENDING" && metadata.inviteeEmail && metadata.inviterEmail
          ? buildInviteUrl(ref.campaign, {
              refCode: callerRefCode,
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

    // Check permissions
    if (
      user.role !== UserRole.ADMIN &&
      referral.referrerId !== user.id &&
      referral.referredUserId !== user.id
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
