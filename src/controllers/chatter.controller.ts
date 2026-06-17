import {
  PasswordResetPurpose,
  Prisma,
  PrismaClient,
  UserRole,
  UserType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { validationResult } from "express-validator";
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import {
  clearMjfpCredentialsCache,
  getMjfpToken,
} from "../lib/mjfp-credentials";
import { AuthRequest } from "../middleware/auth.middleware";
import { emailService } from "../services/email.service";
import { createPasswordResetToken } from "../services/password-reset.service";
import { getPresignedUrl } from "../services/s3.service";
import { syncUserFromTeaseMe } from "../services/teaseme.service";
import { buildSetPasswordUrl } from "../utils/frontend-url";
import {
  isValidInstagramUsername,
  normalizeInstagramUsername,
} from "../utils/instagram-username";
import {
  giftActivityDedupeKey,
  isSyntheticPayerEmail,
  isUidSyntheticPayerEmail,
  preferStoredPayerEmail,
  resolveRedeemablePayerEmail,
} from "../utils/payer-email";
import { resolveAccountManagersFor } from "../services/ownership.service";
import { createVipInviteRecord } from "../services/vip-invite.service";

const prisma = new PrismaClient();
const PREREGISTER_URL =
  process.env.PREREGISTER_VIP_TEASEME_USER ||
  process.env.VITE_PREREGISTER_VIP_TEASEME_USER;

const PROMO_CODES_URL = (process.env.TEASEME_PROMO_CODES_URL || "").replace(
  /\/$/,
  "",
);

const TEASEME_API_URL = (process.env.TEASEME_API_URL || "").replace(/\/$/, "");

const PROMO_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generatePromoCode = (length = 6): string => {
  const bytes = crypto.randomBytes(length);
  return Array.from(
    bytes,
    (b) => PROMO_CODE_CHARS[b % PROMO_CODE_CHARS.length],
  ).join("");
};

const isAccountManagerOrAdmin = (req: AuthRequest): boolean => {
  if (!req.user) return false;
  return (
    req.user.role === UserRole.ADMIN ||
    req.user.userType === UserType.ACCOUNT_MANAGER
  );
};

const isAdmin = (req: AuthRequest): boolean =>
  req.user?.role === UserRole.ADMIN || req.user?.userType === UserType.ADMIN;

// A chatter is considered "owned" by an AM when any of these hold:
//   (a) the AM is the dedicated `accountManagerId` on the chatter,
//   (b) the AM originally created them (`createdById`) — legacy fallback
//       for rows that predate the dedicated ownership column,
//   (c) the chatter is a member of a group the AM created — keeps pre-
//       column chatters visible to whichever AM actually works with them.
const chattersOwnedByWhere = (accountManagerId: string) => ({
  userType: UserType.CHATTER,
  OR: [
    { accountManagerId },
    { createdById: accountManagerId },
    {
      chatterGroupMemberships: {
        some: { group: { createdById: accountManagerId } },
      },
    },
  ],
});

const createdBySelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

// POST /api/chatters — create a new chatter (admin or account manager)
export const createChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res
        .status(403)
        .json({ error: "Only admins or account managers can create chatters" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, firstName, lastName } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res
        .status(400)
        .json({ error: "A user with that email already exists" });
    }

    // Placeholder password — the chatter will set their own via the invite
    // email. Stored only because `users.password` is NOT NULL.
    const placeholderSecret = crypto.randomBytes(32).toString("base64url");
    const hashedPassword = await bcrypt.hash(placeholderSecret, 10);
    const inviteCode = nanoid(10);

    // Dual-stamp when the caller is an active AM: they created the chatter
    // AND own them. Admin-created chatters start unassigned (admins aren't
    // AMs) and get linked via the drag-and-drop flow on the Users page.
    const callerId = req.user!.id;
    const callerIsAm = req.user!.userType === UserType.ACCOUNT_MANAGER;

    const chatter = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        role: UserRole.PROMOTER,
        userType: UserType.CHATTER,
        inviteCode,
        isActive: true,
        createdById: callerId,
        accountManagerId: callerIsAm ? callerId : null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
        isActive: true,
        createdAt: true,
        createdBy: { select: createdBySelect },
      },
    });

    let inviteEmailSent = false;
    try {
      const { rawToken, expiresAt } = await createPasswordResetToken(
        chatter.id,
        PasswordResetPurpose.INVITE,
      );
      const setupUrl = buildSetPasswordUrl(rawToken);
      const callerRecord = await prisma.user.findUnique({
        where: { id: callerId },
        select: { firstName: true, lastName: true, email: true },
      });
      const invitedByName =
        [callerRecord?.firstName, callerRecord?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        callerRecord?.email ||
        req.user!.email;
      inviteEmailSent = await emailService.sendSetPasswordEmail({
        email: chatter.email,
        firstName: chatter.firstName,
        setupUrl,
        invitedByName,
        expiresAt,
      });
    } catch (err) {
      console.error("Failed to send chatter invite email:", err);
    }

    res.status(201).json({
      chatter,
      inviteEmailSent,
      message: inviteEmailSent
        ? "Chatter created and invite email sent"
        : "Chatter created — invite email could not be sent",
    });
  } catch (error) {
    console.error("Create chatter error:", error);
    res.status(500).json({ error: "Failed to create chatter" });
  }
};

type PreregisterPayload = {
  influencer_id: string;
  full_name: string;
  instagram_username: string;
};

type PreregisterUpstream =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

const callPreregisterUpstream = async (
  payload: PreregisterPayload,
  token: string,
): Promise<PreregisterUpstream> => {
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(PREREGISTER_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const status =
      error instanceof Error && error.name === "TimeoutError" ? 504 : 502;
    const message =
      status === 504
        ? "Preregistration service timed out"
        : "Could not reach preregistration service";
    return { ok: false, status, error: message };
  }

  const raw = await upstream.json().catch(() => null);
  const parsed =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  if (!upstream.ok) {
    if (upstream.status === 401) {
      clearMjfpCredentialsCache();
    }
    const detail =
      parsed && typeof parsed.detail === "string" ? parsed.detail : "";
    return {
      ok: false,
      status: upstream.status,
      error: detail || `Preregistration failed (HTTP ${upstream.status})`,
    };
  }

  if (!parsed || typeof parsed.invite_code !== "string" || !parsed.invite_code.trim()) {
    return {
      ok: false,
      status: 502,
      error: "Unexpected response from preregistration service",
    };
  }

  return { ok: true, body: parsed };
};

type PromoCodePayload = {
  code: string;
  email: string;
  reward_credits: number;
  influencer_id: string;
  max_redemptions: number;
  expires_at?: string;
};

type TeasemeUpstreamResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

const pickUpstreamError = (parsed: Record<string, unknown> | null): string => {
  if (!parsed) return "";
  for (const key of ["error", "message", "detail"] as const) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const callTeasemeJsonUpstream = async (
  url: string,
  payload: Record<string, unknown>,
  token: string,
  failureLabel: string,
): Promise<TeasemeUpstreamResult> => {
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const status =
      error instanceof Error && error.name === "TimeoutError" ? 504 : 502;
    const message =
      status === 504
        ? `${failureLabel} timed out`
        : `Could not reach ${failureLabel.toLowerCase()}`;
    return { ok: false, status, error: message };
  }

  const raw = await upstream.json().catch(() => null);
  const parsed =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  if (!upstream.ok) {
    if (upstream.status === 401) {
      clearMjfpCredentialsCache();
    }
    const detail = pickUpstreamError(parsed);
    return {
      ok: false,
      status: upstream.status,
      error: detail || `${failureLabel} failed (HTTP ${upstream.status})`,
    };
  }

  if (!parsed) {
    return {
      ok: false,
      status: 502,
      error: `Unexpected response from ${failureLabel.toLowerCase()}`,
    };
  }

  return { ok: true, body: parsed };
};

// POST /api/chatters/promo-codes — create email-scoped promo code via TeaseMe proxy
export const createPromoCode = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.userType !== UserType.CHATTER) {
      return res
        .status(403)
        .json({ error: "Only chatters can create promo codes" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        error: "Validation failed",
        errors: errors.array(),
      });
    }

    const mjfpToken = await getMjfpToken();
    if (!PROMO_CODES_URL || !mjfpToken) {
      return res
        .status(503)
        .json({ error: "Promo code service is not configured" });
    }

    const rawCode = req.body.code
      ? String(req.body.code).trim().toUpperCase()
      : "";
    const code =
      rawCode.length > 0 ? rawCode.slice(0, 64) : generatePromoCode();

    const rewardCredits =
      req.body.reward_credits != null ? Number(req.body.reward_credits) : 120;
    if (!Number.isInteger(rewardCredits) || rewardCredits < 1) {
      return res
        .status(422)
        .json({ error: "reward_credits must be a positive integer" });
    }

    const maxRedemptions =
      req.body.max_redemptions != null ? Number(req.body.max_redemptions) : 1;
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
      return res
        .status(422)
        .json({ error: "max_redemptions must be a positive integer" });
    }

    const payload: PromoCodePayload = {
      code,
      email: String(req.body.email).trim(),
      reward_credits: rewardCredits,
      influencer_id: String(req.body.influencer_id).trim(),
      max_redemptions: maxRedemptions,
    };

    const expiresAt = req.body.expires_at
      ? String(req.body.expires_at).trim()
      : "";
    if (expiresAt) {
      payload.expires_at = expiresAt;
    }

    const result = await callTeasemeJsonUpstream(
      PROMO_CODES_URL,
      payload,
      mjfpToken,
      "Promo code service",
    );
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    if (result.body.ok !== true || typeof result.body.code !== "string") {
      return res.status(502).json({
        error: "Unexpected response from promo code service",
      });
    }

    return res.status(201).json(result.body);
  } catch (error) {
    console.error("Create promo code error:", error);
    return res.status(500).json({ error: "Failed to create promo code" });
  }
};

// POST /api/chatters/preregister-vip — preregister via backend proxy (authenticated)
export const preregisterVipUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.userType !== UserType.CHATTER) {
      return res
        .status(403)
        .json({ error: "Only chatters can preregister users" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        error: "Validation failed",
        errors: errors.array(),
      });
    }

    const mjfpToken = await getMjfpToken();
    if (!PREREGISTER_URL || !mjfpToken) {
      return res
        .status(503)
        .json({ error: "Preregistration service is not configured" });
    }

    const instagramUsername = normalizeInstagramUsername(
      String(req.body.instagram_username ?? ""),
    );
    if (!instagramUsername) {
      return res.status(422).json({ error: "instagram_username is required" });
    }
    if (!isValidInstagramUsername(instagramUsername)) {
      return res.status(422).json({
        error:
          "instagram_username must be 1–30 characters (letters, numbers, dots, underscores)",
      });
    }

    const groupId = String(req.body.group_id ?? "").trim();
    if (!groupId) {
      return res.status(422).json({ error: "group_id is required" });
    }

    const membership = await prisma.chatterGroupMember.findUnique({
      where: {
        chatterId_groupId: { chatterId: req.user.id, groupId },
      },
    });
    if (!membership) {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
    }

    const payload: PreregisterPayload = {
      // TeaseMe influencer ids are lowercase handles (e.g. "juliana").
      influencer_id: String(req.body.influencer_id).trim().toLowerCase(),
      full_name: String(req.body.full_name).trim(),
      instagram_username: instagramUsername,
    };

    const result = await callPreregisterUpstream(payload, mjfpToken);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const upstreamUserId = result.body.user_id;
    const teasemeUserId =
      typeof upstreamUserId === "number"
        ? upstreamUserId
        : typeof upstreamUserId === "string" && /^\d+$/.test(upstreamUserId)
          ? Number(upstreamUserId)
          : null;
    if (teasemeUserId === null || !Number.isInteger(teasemeUserId)) {
      return res.status(502).json({
        error: "Unexpected response from preregistration service (missing user_id)",
      });
    }

    const expiresAtRaw = result.body.expires_at;
    const expiresAt =
      typeof expiresAtRaw === "string" && !Number.isNaN(Date.parse(expiresAtRaw))
        ? new Date(expiresAtRaw)
        : undefined;

    const invite = await createVipInviteRecord({
      chatterId: req.user.id,
      groupId,
      teasemeUserId,
      instagramUsername,
      fullName: payload.full_name,
      influencerId: payload.influencer_id,
      inviteCode: String(result.body.invite_code).trim(),
      expiresAt,
    });

    return res.json({
      invite_id: invite.id,
      user_id: teasemeUserId,
      invite_code: invite.inviteCode,
      status: invite.status,
      ...(typeof result.body.expires_at === "string"
        ? { expires_at: result.body.expires_at }
        : {}),
    });
  } catch (error) {
    console.error("Preregister VIP error:", error);
    return res.status(500).json({ error: "Failed to preregister user" });
  }
};

// GET /api/chatters/me/groups — list groups the logged-in chatter belongs to
export const getMyGroups = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.userType !== UserType.CHATTER) {
      return res
        .status(403)
        .json({ error: "Only chatters can access their groups" });
    }
    const promoterSelect = {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      voiceId: true,
      profilePhotoKey: true,
      profileVideoKey: true,
      teasemeSyncedAt: true,
      socialLinks: { select: { platform: true, url: true } },
    } as const;

    const groupSelect = {
      id: true,
      name: true,
      tag: true,
      commissionPercentage: true,
      promoter: { select: promoterSelect },
      members: {
        select: {
          id: true,
          chatterId: true,
          chatter: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    } as const;

    const memberships = await prisma.chatterGroupMember.findMany({
      where: { chatterId: req.user.id },
      select: { group: { select: groupSelect } },
    });

    let groups = memberships.map((m) => m.group);

    // Lazy auto-sync: pull promoter data (voice, photo, video, social links) from TeaseMe
    // on first access AND whenever the cached copy is older than SYNC_TTL_MS. This keeps
    // newly-added fields (e.g. OnlyFans link added to TeaseMe after initial sync) from
    // getting stuck in an "already synced, never refreshed" state.
    // - Deduped by promoter id (a chatter can belong to several groups under the same promoter)
    // - Bounded concurrency to avoid bursty outbound traffic on the read path
    // - Failures are logged and swallowed; this request still waits for attempted refreshes,
    //   then re-fetches so the current response reflects freshly-synced data when available
    const SYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
    const now = Date.now();
    const toSyncMap = new Map<string, { id: string; username: string }>();
    for (const g of groups) {
      const p = g.promoter;
      if (!p?.username || toSyncMap.has(p.id)) continue;
      const lastSyncedAt = p.teasemeSyncedAt
        ? p.teasemeSyncedAt.getTime()
        : null;
      const isStale = lastSyncedAt === null || now - lastSyncedAt > SYNC_TTL_MS;
      if (isStale) {
        toSyncMap.set(p.id, { id: p.id, username: p.username });
      }
    }

    if (toSyncMap.size > 0) {
      const queue = Array.from(toSyncMap.values());
      const concurrency = Math.min(3, queue.length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) {
          const index = cursor++;
          const p = queue[index];
          try {
            await syncUserFromTeaseMe(p.id);
          } catch (err) {
            console.error(
              `[chatter.getMyGroups] TeaseMe sync failed for ${p.username}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      // Re-fetch so the response reflects freshly-synced data.
      const refreshed = await prisma.chatterGroupMember.findMany({
        where: { chatterId: req.user.id },
        select: { group: { select: groupSelect } },
      });
      groups = refreshed.map((m) => m.group);
    }

    // Mint fresh presigned URLs on every request (never store them in DB),
    // but dedupe repeated signing work within this request.
    const presignedUrlCache = new Map<string, Promise<string | null>>();
    const getCachedPresignedUrl = (key: string | null | undefined) => {
      if (!key) return getPresignedUrl(key);
      let urlPromise = presignedUrlCache.get(key);
      if (!urlPromise) {
        urlPromise = getPresignedUrl(key);
        presignedUrlCache.set(key, urlPromise);
      }
      return urlPromise;
    };

    const hydrated = await Promise.all(
      groups.map(async (g) => {
        if (!g.promoter) return g;
        const { profilePhotoKey, profileVideoKey, ...rest } = g.promoter;
        const [photoUrl, videoUrl] = await Promise.all([
          getCachedPresignedUrl(profilePhotoKey),
          getCachedPresignedUrl(profileVideoKey),
        ]);
        return {
          ...g,
          promoter: {
            ...rest,
            photoUrl,
            videoUrl,
          },
        };
      }),
    );

    res.json({ groups: hydrated });
  } catch (error) {
    console.error("Get my groups error:", error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
};

// GET /api/chatters — list chatters
//
// Scoping:
// - ADMIN sees every chatter. Supports `?accountManagerId=<id>` to filter to
//   chatters owned by a specific AM (created by OR in one of their groups).
// - ACCOUNT_MANAGER only sees chatters they own. The `accountManagerId`
//   query param is ignored for non-admins (they're always scoped to themselves).
export const listChatters = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const admin = isAdmin(req);
    const requestedAmId =
      typeof req.query.accountManagerId === "string"
        ? req.query.accountManagerId.trim()
        : "";

    let where: any;
    if (admin) {
      where = requestedAmId
        ? chattersOwnedByWhere(requestedAmId)
        : { userType: UserType.CHATTER };
    } else {
      where = chattersOwnedByWhere(req.user!.id);
    }

    const chatters = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        createdBy: { select: createdBySelect },
        chatterGroupMemberships: {
          select: {
            group: {
              select: {
                id: true,
                name: true,
                createdBy: { select: createdBySelect },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const mapped = chatters.map((c) => ({
      ...c,
      groups: c.chatterGroupMemberships.map((m) => m.group),
      chatterGroupMemberships: undefined,
    }));

    res.json({ chatters: mapped });
  } catch (error) {
    console.error("List chatters error:", error);
    res.status(500).json({ error: "Failed to list chatters" });
  }
};

// GET /api/chatters/:id — get a single chatter
export const getChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;

    const where = isAdmin(req)
      ? { id, userType: UserType.CHATTER }
      : { AND: [{ id }, chattersOwnedByWhere(req.user!.id)] };

    const chatter = await prisma.user.findFirst({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        createdBy: { select: createdBySelect },
        chatterGroupMemberships: {
          select: {
            group: {
              select: {
                id: true,
                name: true,
                commissionPercentage: true,
                createdBy: { select: createdBySelect },
              },
            },
          },
        },
        commissions: {
          where: { type: "chatter" },
          select: { id: true, amount: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!chatter) {
      return res.status(404).json({ error: "Chatter not found" });
    }

    res.json({
      chatter: {
        ...chatter,
        groups: chatter.chatterGroupMemberships.map((m) => m.group),
        chatterGroupMemberships: undefined,
      },
    });
  } catch (error) {
    console.error("Get chatter error:", error);
    res.status(500).json({ error: "Failed to get chatter" });
  }
};

// PATCH /api/chatters/:id — update a chatter's name / email
export const updateChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: "Validation failed", errors: errors.array() });
    }

    const { id } = req.params;
    const { firstName, lastName, email } = req.body;

    const where = isAdmin(req)
      ? { id, userType: UserType.CHATTER }
      : { AND: [{ id }, chattersOwnedByWhere(req.user!.id)] };

    const existing = await prisma.user.findFirst({ where });
    if (!existing) {
      return res.status(404).json({ error: "Chatter not found" });
    }

    const data: Record<string, unknown> = {};
    if (typeof firstName === "string")
      data.firstName = firstName.trim() || null;
    if (typeof lastName === "string") data.lastName = lastName.trim() || null;
    if (typeof email === "string") {
      const trimmed = email.trim().toLowerCase();
      if (trimmed !== existing.email) {
        const conflict = await prisma.user.findUnique({
          where: { email: trimmed },
        });
        if (conflict) {
          return res
            .status(400)
            .json({ error: "A user with that email already exists" });
        }
        data.email = trimmed;
      }
    }

    const chatter = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        createdBy: { select: createdBySelect },
        chatterGroupMemberships: {
          select: {
            group: {
              select: {
                id: true,
                name: true,
                createdBy: { select: createdBySelect },
              },
            },
          },
        },
      },
    });

    res.json({
      chatter: {
        ...chatter,
        groups: chatter.chatterGroupMemberships.map((m) => m.group),
        chatterGroupMemberships: undefined,
      },
    });
  } catch (error) {
    console.error("Update chatter error:", error);
    res.status(500).json({ error: "Failed to update chatter" });
  }
};

// POST /api/chatters/:id/resend-invite — resend the welcome / set-password email
export const resendInviteEmail = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;

    const where = isAdmin(req)
      ? { id, userType: UserType.CHATTER }
      : { AND: [{ id }, chattersOwnedByWhere(req.user!.id)] };

    const chatter = await prisma.user.findFirst({ where });
    if (!chatter) {
      return res.status(404).json({ error: "Chatter not found" });
    }

    if (chatter.isActive) {
      return res.status(400).json({
        error:
          "Chatter has already activated their account. Use the password reset flow instead.",
      });
    }

    const callerId = req.user!.id;
    const callerRecord = await prisma.user.findUnique({
      where: { id: callerId },
      select: { firstName: true, lastName: true, email: true },
    });
    const invitedByName =
      [callerRecord?.firstName, callerRecord?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      callerRecord?.email ||
      req.user!.email;

    const { rawToken, expiresAt } = await createPasswordResetToken(
      chatter.id,
      PasswordResetPurpose.INVITE,
    );
    const setupUrl = buildSetPasswordUrl(rawToken);

    const sent = await emailService.sendSetPasswordEmail({
      email: chatter.email,
      firstName: chatter.firstName,
      setupUrl,
      invitedByName,
      expiresAt,
    });

    if (!sent) {
      return res.status(502).json({ error: "Failed to send invite email" });
    }

    res.json({ message: "Invite email sent" });
  } catch (error) {
    console.error("Resend invite email error:", error);
    res.status(500).json({ error: "Failed to resend invite email" });
  }
};

// DELETE /api/chatters/:id — delete a chatter
export const deleteChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;

    const where = isAdmin(req)
      ? { id, userType: UserType.CHATTER }
      : { AND: [{ id }, chattersOwnedByWhere(req.user!.id)] };

    const chatter = await prisma.user.findFirst({ where });

    if (!chatter) {
      return res.status(404).json({ error: "Chatter not found" });
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: "Chatter deleted successfully" });
  } catch (error) {
    console.error("Delete chatter error:", error);
    res.status(500).json({ error: "Failed to delete chatter" });
  }
};

type SaleTxnRow = { saleAmount: number; createdAt: Date; eventId?: string };

/** Completed sales only — refunded originals keep type "sale" but status "refunded". */
const completedSaleWhere = { type: "sale" as const, status: "completed" as const };

/** Sales on a shared customer row that earned promoter commission for one influencer. */
const completedSalesForPromoter = (promoterId: string) => ({
  ...completedSaleWhere,
  commissions: {
    some: { userId: promoterId, type: "promoter" as const },
  },
});

type GiftActivityEvent = {
  type: "deposit" | "first_deposit" | "gift" | "accepted" | "invited" | "expired";
  date: string;
  amount_cents?: number;
  ref?: string;
  code?: string;
};

type GiftRecord = {
  status: string;
  promoCode: string;
  sentAt: Date | null;
  acceptedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const latestSaleTime = (txns: SaleTxnRow[]): number =>
  txns.length > 0 ? Math.max(...txns.map((t) => t.createdAt.getTime())) : 0;

/** One row per eventId when merging payer emails (same sale can appear on multiple customers). */
const dedupeSaleTransactionsByEventId = <T extends SaleTxnRow>(txns: T[]): T[] => {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const t of txns) {
    const eventId = t.eventId?.trim();
    if (eventId) {
      if (seen.has(eventId)) continue;
      seen.add(eventId);
    }
    deduped.push(t);
  }
  return deduped.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
};

const isGiftTimeExpired = (gift: Pick<GiftRecord, "status" | "expiresAt">): boolean =>
  gift.status === "SENT" &&
  gift.expiresAt != null &&
  gift.expiresAt < new Date();

const resolveGiftStatus = (
  gift: GiftRecord | undefined,
): "none" | "pending" | "sent" | "accepted" | "expired" | "invited" => {
  if (!gift) return "none";
  if (isGiftTimeExpired(gift)) {
    return "expired";
  }
  return gift.status.toLowerCase() as
    | "pending"
    | "sent"
    | "accepted"
    | "expired"
    | "invited";
};

const buildGiftActivityEvents = (
  txns: SaleTxnRow[],
  gift: GiftRecord | undefined,
  giftStatus: ReturnType<typeof resolveGiftStatus>,
  referral: { status: string; createdAt: Date } | null | undefined,
): GiftActivityEvent[] => {
  const events: GiftActivityEvent[] = [];
  const sorted = [...txns].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const firstDeposit =
    txns.length > 0
      ? [...txns].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
      : null;

  for (const t of sorted) {
    const isFirst = firstDeposit != null && t === firstDeposit;
    events.push({
      type: isFirst ? "first_deposit" : "deposit",
      date: t.createdAt.toISOString(),
      amount_cents: Math.round(t.saleAmount * 100),
      ref: t.eventId,
    });
  }

  if (gift) {
    if (giftStatus === "sent" || giftStatus === "accepted") {
      events.push({
        type: "gift",
        date: (gift.sentAt ?? gift.createdAt).toISOString(),
        code: gift.promoCode,
      });
    }
    if (giftStatus === "accepted") {
      events.push({
        type: "accepted",
        date: (gift.acceptedAt ?? gift.sentAt ?? gift.createdAt).toISOString(),
        code: gift.promoCode,
      });
    }
    if (giftStatus === "invited") {
      events.push({
        type: "invited",
        date: gift.createdAt.toISOString(),
      });
    }
    if (giftStatus === "expired") {
      events.push({
        type: "expired",
        date: (gift.expiresAt ?? gift.updatedAt).toISOString(),
        code: gift.promoCode,
      });
    }
  } else if (referral?.status === "PENDING") {
    events.push({
      type: "invited",
      date: referral.createdAt.toISOString(),
    });
  }

  events.sort((a, b) => (b.date > a.date ? 1 : -1));
  return events;
};

/** Aggregate sale transactions for one payer (matches feed + send eligibility). */
const aggregatePayerSales = (txns: SaleTxnRow[]) => {
  const sorted = dedupeSaleTransactionsByEventId(txns);
  const depositCount = sorted.length;
  return {
    depositCount,
    isFirstDeposit: depositCount === 1,
    lifetimeCents: Math.round(
      sorted.reduce((sum, t) => sum + t.saleAmount, 0) * 100,
    ),
    lastDepositCents:
      sorted.length > 0 ? Math.round(sorted[0].saleAmount * 100) : 0,
    lastDate: sorted.length > 0 ? sorted[0].createdAt : null,
  };
};

/** Gift activity access — admins always; promoters for self; AMs via ownership; chatters via group membership. */
const canAccessGiftActivity = async (
  req: AuthRequest,
  promoter: { id: string },
  groupId: string,
): Promise<boolean> => {
  if (isAdmin(req)) return true;
  const callerId = req.user!.id;
  if (callerId === promoter.id) return true;

  const isAccountManager = req.user!.userType === UserType.ACCOUNT_MANAGER;

  if (groupId) {
    if (isAccountManager) {
      const group = await prisma.chatterGroup.findUnique({
        where: { id: groupId },
        select: {
          createdById: true,
          promoter: { select: { id: true } },
          members: { select: { chatterId: true } },
        },
      });
      if (!group || group.promoter?.id !== promoter.id) return false;
      if (group.createdById === callerId) return true;

      const ids = new Set<string>();
      if (group.createdById) ids.add(group.createdById);
      if (group.promoter?.id) ids.add(group.promoter.id);
      for (const m of group.members) {
        if (m.chatterId) ids.add(m.chatterId);
      }
      if (ids.size === 0) return false;

      const amByUser = await resolveAccountManagersFor(Array.from(ids));
      for (const uid of ids) {
        if (amByUser.get(uid) === callerId) return true;
      }
      return false;
    }

    const membership = await prisma.chatterGroupMember.findUnique({
      where: {
        chatterId_groupId: { chatterId: callerId, groupId },
      },
      select: { id: true },
    });
    if (!membership) return false;

    const group = await prisma.chatterGroup.findUnique({
      where: { id: groupId },
      select: { promoter: { select: { id: true } } },
    });
    return group?.promoter?.id === promoter.id;
  }

  if (isAccountManager) {
    const amByUser = await resolveAccountManagersFor([promoter.id]);
    return amByUser.get(promoter.id) === callerId;
  }

  return false;
};

// GET /api/chatters/gift-activity?influencer_id=X&groupId=Y&search=Z
export const getGiftActivity = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const influencerId = String(req.query.influencer_id ?? "").trim();
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const missingOnly = req.query.missing_only === "true";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));

    if (!influencerId) {
      return res.status(400).json({ error: "influencer_id is required" });
    }

    const groupId = String(req.query.groupId ?? "").trim();

    // Resolve the promoter by username
    const promoter = await prisma.user.findUnique({
      where: { username: influencerId },
      select: { id: true },
    });

    // Same empty payload for unknown usernames and callers without access so
    // authenticated users cannot infer which influencer_id values exist.
    if (
      !promoter ||
      !(await canAccessGiftActivity(req, promoter, groupId))
    ) {
      return res.json({ items: [], pending_count: 0, awaiting_redemption_count: 0 });
    }

    // Payers who generated promoter commissions for this influencer. We key off
    // commission.userId (not customer.referral.referrerId) because level-2 sales
    // credit the selling promoter while the customer referral row still points at
    // the link-sharer (e.g. jorlyn → juliana chain).
    const commissions = await prisma.commission.findMany({
      where: {
        userId: promoter.id,
        type: "promoter",
        customerId: { not: null },
      },
      select: {
        customerId: true,
      },
      distinct: ["customerId"],
    });

    const customerIds = commissions
      .map((c) => c.customerId)
      .filter((id): id is string => !!id);

    if (!customerIds.length) {
      return res.json({ items: [], pending_count: 0, awaiting_redemption_count: 0 });
    }

    // Load full customer data with aggregated transaction info
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        referral: { select: { inviteCode: true, status: true, createdAt: true } },
        transactions: {
          where: completedSalesForPromoter(promoter.id),
          select: { saleAmount: true, createdAt: true, eventId: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Fetch gifts by redeemable payer email and by customer id (transactionRef).
    const redeemableEmails = customers
      .map((c) => resolveRedeemablePayerEmail(c.email))
      .filter((e): e is string => !!e);
    const giftWhere: Prisma.FirstDepositGiftWhereInput[] = [];
    if (redeemableEmails.length) {
      giftWhere.push({
        payerEmail: { in: redeemableEmails, mode: "insensitive" },
      });
    }
    if (customerIds.length) {
      giftWhere.push({ transactionRef: { in: customerIds } });
    }
    const gifts = giftWhere.length
      ? await prisma.firstDepositGift.findMany({
          where: { OR: giftWhere },
          orderBy: { createdAt: "desc" },
        })
      : [];
    // Newest gift per email / transactionRef wins (gifts are ordered desc).
    const giftByEmail = new Map<string, (typeof gifts)[0]>();
    const giftByTransactionRef = new Map<string, (typeof gifts)[0]>();
    for (const g of gifts) {
      const emailKey = g.payerEmail?.toLowerCase();
      if (emailKey && !giftByEmail.has(emailKey)) {
        giftByEmail.set(emailKey, g);
      }
      if (g.transactionRef && !giftByTransactionRef.has(g.transactionRef)) {
        giftByTransactionRef.set(g.transactionRef, g);
      }
    }

    const vipInvites = redeemableEmails.length
      ? await prisma.vipInvite.findMany({
          where: { email: { in: redeemableEmails, mode: "insensitive" } },
          select: { email: true, instagramUsername: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const handleByEmail = new Map<string, string>();
    for (const invite of vipInvites) {
      const key = invite.email?.toLowerCase();
      if (key && invite.instagramUsername && !handleByEmail.has(key)) {
        handleByEmail.set(key, invite.instagramUsername);
      }
    }

    // Build response items — one row per payer (real email / uid / sale).
    type MergedCustomer = (typeof customers)[0] & {
      joinedAt: Date;
      mergedCustomerIds: string[];
    };
    const seenEmails = new Map<string, MergedCustomer>();
    for (const c of customers) {
      const key = giftActivityDedupeKey(c);
      const existing = seenEmails.get(key);
      if (!existing) {
        seenEmails.set(key, {
          ...c,
          joinedAt: c.createdAt,
          mergedCustomerIds: [c.id],
        });
      } else {
        existing.mergedCustomerIds.push(c.id);
        existing.email = preferStoredPayerEmail(existing.email, c.email);
        const existingRedeemable = resolveRedeemablePayerEmail(existing.email);
        const incomingRedeemable = resolveRedeemablePayerEmail(c.email);
        // Prefer the customer row that carries a real payer email, else latest sale.
        if (incomingRedeemable && !existingRedeemable) {
          existing.id = c.id;
          existing.name = c.name ?? existing.name;
          existing.referral = c.referral ?? existing.referral;
        } else if (
          latestSaleTime(c.transactions) > latestSaleTime(existing.transactions)
        ) {
          existing.id = c.id;
          existing.name = c.name ?? existing.name;
          existing.referral = c.referral ?? existing.referral;
        }
        if (c.createdAt < existing.joinedAt) {
          existing.joinedAt = c.createdAt;
        }
        existing.transactions = dedupeSaleTransactionsByEventId([
          ...existing.transactions,
          ...c.transactions,
        ]);
      }
    }

    const resolveGiftForCustomer = (c: MergedCustomer) => {
      const redeemableEmail = resolveRedeemablePayerEmail(c.email);
      if (redeemableEmail) {
        const byEmail = giftByEmail.get(redeemableEmail.toLowerCase());
        if (byEmail) return byEmail;
      }
      for (const id of c.mergedCustomerIds) {
        const byRef = giftByTransactionRef.get(id);
        if (byRef) return byRef;
      }
      return undefined;
    };

    const allItems = Array.from(seenEmails.values())
      .map((c) => {
        const {
          depositCount,
          isFirstDeposit,
          lifetimeCents,
          lastDepositCents,
          lastDate,
        } = aggregatePayerSales(c.transactions);
        const date = lastDate?.toISOString() ?? c.createdAt.toISOString();

        const redeemableEmail = resolveRedeemablePayerEmail(c.email);
        const emailKey = redeemableEmail?.toLowerCase() ?? "";
        const gift = resolveGiftForCustomer(c);
        const giftStatus = resolveGiftStatus(gift);
        const handle = emailKey ? (handleByEmail.get(emailKey) ?? null) : null;

        return {
          user_id: c.id,
          influencer_id: influencerId,
          name: c.name ?? null,
          email: redeemableEmail ?? "",
          needs_payer_email: !redeemableEmail && isSyntheticPayerEmail(c.email),
          date,
          joined_at: c.joinedAt.toISOString(),
          handle,
          ref: c.referral?.inviteCode ?? null,
          lifetime_cents: lifetimeCents,
          last_deposit_cents: lastDepositCents,
          gift_status: giftStatus,
          gift_code: giftStatus === "sent" ? (gift?.promoCode ?? null) : null,
          gift_id: gift?.id ?? null,
          expires_at: gift?.expiresAt?.toISOString() ?? null,
          diamonds: gift ? 120 : null,
          is_first_deposit: isFirstDeposit,
          deposit_count: depositCount,
          events: buildGiftActivityEvents(
            c.transactions,
            gift,
            giftStatus,
            c.referral,
          ),
        };
      })
      .sort((a, b) => (b.date > a.date ? 1 : -1));

    // Customers with deposits who still need a code (none/pending/invited/expired).
    const needsGiftCode = (i: (typeof allItems)[number]) =>
      i.deposit_count >= 1 &&
      (i.gift_status === "none" ||
        i.gift_status === "pending" ||
        i.gift_status === "invited" ||
        i.gift_status === "expired");

    const items = search
      ? allItems.filter(
          (item) =>
            item.name?.toLowerCase().includes(search) ||
            item.email.toLowerCase().includes(search),
        )
      : allItems;

    const pendingCount = allItems.filter(needsGiftCode).length;
    const awaitingRedemptionCount = allItems.filter(
      (i) => i.gift_status === "sent",
    ).length;

    const filteredItems = missingOnly ? items.filter(needsGiftCode) : items;

    const total = filteredItems.length;
    const total_pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, total_pages);
    const pagedItems = filteredItems.slice((safePage - 1) * limit, safePage * limit);

    return res.json({
      items: pagedItems,
      pending_count: pendingCount,
      awaiting_redemption_count: awaitingRedemptionCount,
      total,
      page: safePage,
      total_pages,
    });
  } catch (error) {
    console.error("Get gift activity error:", error);
    return res.status(500).json({ error: "Failed to fetch gift activity" });
  }
};

const giftSendPayload = (gift: {
  promoCode: string;
  expiresAt: Date | null;
  status: string;
}) => ({
  ok: true as const,
  code: gift.promoCode,
  status: gift.status === "ACCEPTED" ? ("accepted" as const) : ("sent" as const),
  diamonds: 120,
  expires_at: gift.expiresAt?.toISOString() ?? "",
});

const findActiveGiftForPayer = (payerEmail: string) =>
  prisma.firstDepositGift.findFirst({
    where: {
      payerEmail: { equals: payerEmail, mode: "insensitive" },
      OR: [
        { status: "ACCEPTED" },
        {
          status: "SENT",
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

const expireTimeExpiredSentGiftsForPayer = (payerEmail: string) =>
  prisma.firstDepositGift.updateMany({
    where: {
      payerEmail: { equals: payerEmail, mode: "insensitive" },
      status: "SENT",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });

const isPrismaUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

// POST /api/chatters/gift-activity/:userId/send
export const sendGiftCode = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const customerId = req.params.userId;
    if (!customerId) {
      return res.status(400).json({ error: "userId (customer id) is required" });
    }

    const influencerId = String(req.query.influencer_id ?? "").trim();
    if (!influencerId) {
      return res.status(400).json({ error: "influencer_id is required" });
    }

    const groupId = String(req.query.groupId ?? "").trim();

    // Resolve the promoter and enforce ownership before touching any customer data.
    const promoter = await prisma.user.findUnique({
      where: { username: influencerId },
      select: { id: true },
    });

    if (
      !promoter ||
      !(await canAccessGiftActivity(req, promoter, groupId))
    ) {
      return res.status(404).json({ error: "Influencer not found" });
    }

    // Verify ownership BEFORE loading any customer PII. This prevents
    // callers from probing arbitrary customer IDs (404 vs 403 enumeration)
    // and ensures no sensitive data is read unless the relationship is confirmed.
    const commission = await prisma.commission.findFirst({
      where: {
        userId: promoter.id,
        customerId,
        type: "promoter",
      },
      select: { id: true },
    });

    if (!commission) {
      return res.status(403).json({ error: "Customer is not a referral of this influencer" });
    }

    // Ownership confirmed — now safe to load customer details.
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, email: true, name: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const storedEmail = (customer.email ?? "").trim();
    const bodyPayerEmail =
      typeof req.body?.payer_email === "string" ? req.body.payer_email.trim() : "";

    let payerEmail: string;
    if (isSyntheticPayerEmail(storedEmail)) {
      if (!bodyPayerEmail) {
        return res.status(400).json({
          error: "Real payer email is required — this sale has no redeemable email on file",
        });
      }
      if (isSyntheticPayerEmail(bodyPayerEmail)) {
        return res.status(400).json({ error: "Invalid payer email" });
      }
      payerEmail = bodyPayerEmail;
    } else if (!storedEmail) {
      return res.status(400).json({ error: "Customer email is required to send a gift code" });
    } else {
      payerEmail = storedEmail;
    }

    const persistRedeemableEmailIfNeeded = async () => {
      if (isSyntheticPayerEmail(storedEmail)) {
        await prisma.customer.update({
          where: { id: customerId },
          data: { email: payerEmail },
        });
      }
    };

    // Eligibility is per payer email — same aggregation as getGiftActivity merge.
    const commissionedForPromoter = {
      some: { userId: promoter.id, type: "promoter" as const },
    };
    const relatedCustomerClauses: Prisma.CustomerWhereInput[] = [
      {
        email: { equals: payerEmail, mode: "insensitive" },
        commissions: commissionedForPromoter,
      },
    ];
    if (isUidSyntheticPayerEmail(storedEmail)) {
      // uid-*@temp.com rows merge by placeholder email in the feed.
      relatedCustomerClauses.push({
        email: { equals: storedEmail, mode: "insensitive" },
        commissions: commissionedForPromoter,
      });
    } else if (isSyntheticPayerEmail(storedEmail)) {
      // event-*@temp.com stays one row per customer id.
      relatedCustomerClauses.push({ id: customerId });
    }

    const relatedCustomers = await prisma.customer.findMany({
      where: { OR: relatedCustomerClauses },
      select: {
        transactions: {
          where: completedSalesForPromoter(promoter.id),
          select: { saleAmount: true, createdAt: true, eventId: true },
        },
      },
    });

    const payerTransactions = relatedCustomers.flatMap((c) => c.transactions);
    const { depositCount, lifetimeCents: depositCents } =
      aggregatePayerSales(payerTransactions);

    if (depositCount < 1) {
      return res.status(400).json({ error: "Customer must have at least one deposit" });
    }

    // Check for an existing gift record (newest first; match payer email case-insensitively)
    const existing = await prisma.firstDepositGift.findFirst({
      where: { payerEmail: { equals: payerEmail, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });

    // Already redeemed — return as-is, no new record.
    if (existing && existing.status === "ACCEPTED") {
      await persistRedeemableEmailIfNeeded();
      return res.json(giftSendPayload(existing));
    }

    // Already sent and still valid — return the existing code.
    if (existing && existing.status === "SENT") {
      if (!isGiftTimeExpired(existing)) {
        await persistRedeemableEmailIfNeeded();
        return res.json(giftSendPayload(existing));
      }
      await prisma.firstDepositGift.updateMany({
        where: { id: existing.id, status: "SENT" },
        data: { status: "EXPIRED" },
      });
      // Fall through — issue a fresh code below.
    }

    // PENDING or INVITED — upgrade the existing row to SENT rather than inserting a duplicate.
    if (existing && (existing.status === "PENDING" || existing.status === "INVITED")) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const upgraded = await prisma.firstDepositGift.updateMany({
        where: {
          id: existing.id,
          status: { in: ["PENDING", "INVITED"] },
        },
        data: { status: "SENT", sentAt: new Date(), expiresAt },
      });
      if (upgraded.count === 1) {
        await persistRedeemableEmailIfNeeded();
        return res.json(
          giftSendPayload({ ...existing, status: "SENT", expiresAt }),
        );
      }
      const winner = await findActiveGiftForPayer(payerEmail);
      if (winner) {
        await persistRedeemableEmailIfNeeded();
        return res.json(giftSendPayload(winner));
      }
    }

    // No record, or the only existing one is EXPIRED — generate a fresh code.
    // Clear any stale SENT rows whose expiresAt passed but status was not updated yet.
    await expireTimeExpiredSentGiftsForPayer(payerEmail);

    const PROMO_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const genCode = (len = 8) => {
      const bytes = crypto.randomBytes(len);
      return Array.from(bytes, (b) => PROMO_CHARS[b % PROMO_CHARS.length]).join("");
    };

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    let promoCode = genCode();
    while (await prisma.firstDepositGift.findUnique({ where: { promoCode } })) {
      promoCode = genCode();
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const gift = await prisma.firstDepositGift.create({
          data: {
            promoCode,
            payerEmail: payerEmail,
            payerName: customer.name ?? null,
            transactionRef: customerId,
            depositCents,
            status: "SENT",
            sentAt: new Date(),
            expiresAt,
          },
        });
        await persistRedeemableEmailIfNeeded();
        return res.json(giftSendPayload(gift));
      } catch (error) {
        if (!isPrismaUniqueViolation(error)) {
          throw error;
        }
        const winner = await findActiveGiftForPayer(payerEmail);
        if (winner) {
          await persistRedeemableEmailIfNeeded();
          return res.json(giftSendPayload(winner));
        }
        await expireTimeExpiredSentGiftsForPayer(payerEmail);
        promoCode = genCode();
      }
    }

    throw new Error("Failed to create first-deposit gift after concurrent retries");
  } catch (error) {
    console.error("Send gift code error:", error);
    return res.status(500).json({ error: "Failed to send gift code" });
  }
};
