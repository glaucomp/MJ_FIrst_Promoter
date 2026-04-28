import http from "node:http";
import https from "node:https";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEASEME_API_URL = (
  process.env.TEASEME_API_URL || "https://api.teaseme.live"
).replace(/\/$/, "");

// TeaseMe lifecycle lookup for the pre-user polling flow. Hitting this with a
// referral's email + inviteCode tells us which onboarding step the invitee is
// on inside TeaseMe so the My Promoters list can render a "Step N" chip while
// the user hasn't yet registered on our side.
//
// Upstream contract (POST JSON):
//   POST {TEASEME_STATUS_URL}
//   Headers: { "Content-Type": "application/json", "X-Internal-Token": <MJFP_TOKEN> }
//   Body:    { "invite_code": "...", "invitee_email": "..." }
//   200:     { ok, exists, pre_influencer_id, username, survey_step, status,
//              survey_link, asset_link }
//   `survey_link` is the in-flight onboarding session URL (populated while the
//   invitee is mid-survey). `asset_link` is the live landing-page URL
//   (populated once TeaseMe finishes building the LP). Either may be null.
const TEASEME_STATUS_URL = (
  process.env.TEASEME_STATUS_URL ||
  "https://tmapi.mxjprod.work/mjpromoter/pre-influencers/step-progress"
).replace(/\/$/, "");
const TEASEME_STATUS_TIMEOUT_MS = 3_000;
// The approve call kicks off real work upstream (LP provisioning + DB writes
// + email triggers) and routinely takes longer than the cheap /step-progress
// lookup. Bumped to 30s so a slow upstream doesn't get aborted client-side
// and surface as a misleading "TeaseMe couldn't start the landing-page build"
// toast while the work was actually in progress.
const TEASEME_APPROVE_TIMEOUT_MS = 30_000;

export interface TeasemePreUserStatus {
  step: number;
  active: boolean;
  teasemeUserId: string | null;
  username: string | null;
  status: string | null;
  // In-flight onboarding session URL (null until the invitee has started).
  surveyLink: string | null;
  // Live landing-page URL (null until TeaseMe finishes building it).
  assetLink: string | null;
}

/**
 * Look up a pre-registered user's TeaseMe onboarding status. At least one of
 * `email` / `inviteCode` must be provided. Returns `null` on 404 / non-2xx /
 * timeout / network error / `exists: false` so callers can keep the
 * last-known state rather than propagating upstream outages to the UI.
 */
export const fetchTeasemePreUserStatus = async (params: {
  email?: string;
  inviteCode?: string;
}): Promise<TeasemePreUserStatus | null> => {
  const email = params.email?.trim() || "";
  const inviteCode = params.inviteCode?.trim() || "";
  if (!email && !inviteCode) {
    throw new Error("fetchTeasemePreUserStatus requires email or inviteCode");
  }

  // Use the server-only MJFP_TOKEN. Never fall back to VITE_-prefixed vars:
  // Vite exposes those to the frontend bundle, which would leak the secret.
  const token = process.env.MJFP_TOKEN;
  if (!token) {
    // Without the shared token the upstream will refuse every request — fail
    // open so the list still renders instead of looping on 401s.
    return null;
  }

  const payload: Record<string, string> = {};
  if (inviteCode) payload.invite_code = inviteCode;
  if (email) payload.invitee_email = email;

  let res: Response;
  try {
    res = await fetch(TEASEME_STATUS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TEASEME_STATUS_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;

  const raw = body as Record<string, unknown>;

  // Upstream signals "no record" via `ok: false` or `exists: false` instead
  // of a 404 — treat both as a miss so we don't overwrite cached state.
  if (raw.ok === false) return null;
  if (raw.exists === false) return null;

  const surveyStep =
    typeof raw.survey_step === "number"
      ? raw.survey_step
      : Number(raw.survey_step);
  if (!Number.isFinite(surveyStep)) return null;

  const statusStr =
    typeof raw.status === "string" && raw.status ? raw.status : null;

  // Only accept non-empty strings; treat anything else (null, "", number, etc)
  // as "not provided" so callers can preserve the last-known value.
  const surveyLink =
    typeof raw.survey_link === "string" && raw.survey_link
      ? raw.survey_link
      : null;
  const assetLink =
    typeof raw.asset_link === "string" && raw.asset_link
      ? raw.asset_link
      : null;

  const preInfluencerId = raw.pre_influencer_id;
  const teasemeUserId =
    typeof preInfluencerId === "string" && preInfluencerId
      ? preInfluencerId
      : typeof preInfluencerId === "number" && Number.isFinite(preInfluencerId)
        ? String(preInfluencerId)
        : null;

  return {
    step: Math.max(0, Math.trunc(surveyStep)),
    // Upstream uses `status: "pending" | "active" | ...`. Anything that is
    // not explicitly "pending" (and exists) counts as active for UI badges.
    active: statusStr !== null && statusStr !== "pending",
    teasemeUserId,
    username:
      typeof raw.username === "string" && raw.username ? raw.username : null,
    status: statusStr,
    surveyLink,
    assetLink,
  };
};

// ─── Lifecycle action helpers (My Promoters card buttons) ───────────────────
//
// Each helper below POSTs JSON to a TeaseMe "pre-influencer" endpoint. All four
// share the same transport shape as `/step-progress`:
//   - `X-Internal-Token` header = MJFP_TOKEN
//   - `Content-Type: application/json` body
//   - non-2xx -> we return `null` instead of throwing, so a UI toast can be
//     shown without killing the caller.
//
// Path suffixes are our current best guess. The TeaseMe team is expected to
// confirm / rename these; override via env vars when that happens instead of
// patching the hardcoded defaults.
const TEASEME_DENY_URL = (
  process.env.TEASEME_DENY_URL ||
  "https://tmapi.mxjprod.work/mjpromoter/pre-influencers/deny"
).replace(/\/$/, "");
const TEASEME_REASSIGN_URL = (
  process.env.TEASEME_REASSIGN_URL ||
  "https://tmapi.mxjprod.work/mjpromoter/pre-influencers/reassign"
).replace(/\/$/, "");
const TEASEME_ORDER_LP_URL = (
  process.env.TEASEME_ORDER_LP_URL ||
  "https://tmapi.mxjprod.work/mjpromoter/pre-influencers/order-landing-page"
).replace(/\/$/, "");
const TEASEME_ASSIGN_CHATTERS_URL = (
  process.env.TEASEME_ASSIGN_CHATTERS_URL ||
  "https://tmapi.mxjprod.work/mjpromoter/pre-influencers/assign-chatters"
).replace(/\/$/, "");
// Approve endpoint hit by the AM-facing "Order Landing Page" button. Distinct
// from TEASEME_ORDER_LP_URL because the upstream contract differs (this one
// flips the pre-influencer to "approved" and kicks off the LP build).
const MJFP_APPROVE_URL = (
  process.env.MJFP_APPROVE_URL ||
  "https://localhost:8000/mjpromoter/pre-influencers/approve"
).replace(/\/$/, "");

export interface TeasemeActionResult {
  ok: boolean;
  status?: string | null;
  raw?: unknown;
}

// Raw http(s) POST that tolerates self-signed TLS certs (rejectUnauthorized:
// false). We can't use the global `fetch` for this because Node's fetch (built
// on undici) doesn't expose a per-call cert-verification toggle without
// pulling in `undici` as a direct dep. Falling back to node:http(s) keeps the
// dep tree unchanged and isolates the relaxed TLS behavior to the single call
// site that needs it (the approve helper hits a Python service that may run
// behind a self-signed cert in dev / staging).
// Telemetry tag passed into logs so we can tell which call site failed when
// reading backend output. Kept intentionally tiny (just the leaf path) — the
// goal is to disambiguate "approve" from "step-progress" without leaking the
// full upstream URL into structured logs.
const postRawJson = (
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
  tag = "teaseme",
): Promise<{ status: number; body: unknown } | null> => {
  return new Promise((resolve) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      console.error(`[${tag}] invalid url`, {
        url,
        err: (err as Error).message,
      });
      resolve(null);
      return;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      console.error(`[${tag}] unsupported protocol`, {
        url,
        protocol: parsedUrl.protocol,
      });
      resolve(null);
      return;
    }
    const isHttps = parsedUrl.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = JSON.stringify(body);
    const req = lib.request(
      url,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(payload).toString(),
        },
        // Accept self-signed certs — some upstream environments (local /
        // staging Python services) terminate TLS without a CA-signed cert.
        // Only applied to https:// URLs; ignored for plain http.
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = null;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
          }
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            // Surface the actual upstream status + body so the operator can
            // tell whether the failure was a 404 (route not deployed), 401
            // (token mismatch), 5xx (upstream broke), etc. Truncated to keep
            // the log line readable.
            console.warn(`[${tag}] upstream non-2xx`, {
              url,
              status,
              body: text.slice(0, 500),
            });
          } else {
            console.info(`[${tag}] upstream ok`, {
              url,
              status,
              hasBody: text.length > 0,
            });
          }
          resolve({ status, body: parsed });
        });
      },
    );
    req.on("error", (err) => {
      // Network-level failure: ECONNREFUSED, DNS, TLS handshake (when the
      // remote certificate is rejected for a reason `rejectUnauthorized:
      // false` doesn't cover, e.g. wrong-host SNI), etc.
      console.error(`[${tag}] request error`, {
        url,
        err: err.message,
      });
      resolve(null);
    });
    req.setTimeout(timeoutMs, () => {
      console.warn(`[${tag}] request timed out`, { url, timeoutMs });
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
};

const postToTeaseme = async (
  url: string,
  body: Record<string, unknown>,
): Promise<TeasemeActionResult | null> => {
  const token = process.env.MJFP_TOKEN;
  if (!token) return null;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TEASEME_STATUS_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON response is still valid for 2xx; fall through */
  }
  if (!res.ok) return null;
  const raw =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const upstreamOk = typeof raw.ok === "boolean" ? raw.ok : null;
  if (upstreamOk === false) return null;
  const statusStr =
    typeof raw.status === "string" && raw.status ? raw.status : null;
  return { ok: true, status: statusStr, raw: parsed };
};

/** Deny a pending pre-influencer invite on TeaseMe's side. */
export const denyPreInfluencer = async (params: {
  inviteCode: string;
  email?: string;
  reason?: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error("denyPreInfluencer requires inviteCode");
  }
  const body: Record<string, unknown> = { invite_code: params.inviteCode };
  if (params.email) body.invitee_email = params.email;
  if (params.reason) body.reason = params.reason;
  return postToTeaseme(TEASEME_DENY_URL, body);
};

/** Reassign the referring account manager for a pre-influencer. */
export const reassignPreInfluencer = async (params: {
  inviteCode: string;
  email?: string;
  newManagerEmail: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error("reassignPreInfluencer requires inviteCode");
  }
  if (!params.newManagerEmail) {
    throw new Error("reassignPreInfluencer requires newManagerEmail");
  }
  const body: Record<string, unknown> = {
    invite_code: params.inviteCode,
    new_manager_email: params.newManagerEmail,
  };
  if (params.email) body.invitee_email = params.email;
  return postToTeaseme(TEASEME_REASSIGN_URL, body);
};

/** Request TeaseMe to start building the landing page for this invite. */
export const orderLandingPageForPreInfluencer = async (params: {
  inviteCode: string;
  email?: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error("orderLandingPageForPreInfluencer requires inviteCode");
  }
  const body: Record<string, unknown> = { invite_code: params.inviteCode };
  if (params.email) body.invitee_email = params.email;
  return postToTeaseme(TEASEME_ORDER_LP_URL, body);
};

/**
 * Approve a pre-influencer once their onboarding is complete (3/3). Upstream
 * flips the row to "approved" and starts building the landing page, so the
 * caller is expected to treat a non-null return as "transitioned to building".
 * Both `inviteCode` and `email` are required: the upstream contract demands
 * the pair (unlike the looser order-landing-page endpoint above).
 *
 * Unlike the other helpers in this file, this one uses `postRawJson` instead
 * of `postToTeaseme` because the approve service may sit behind a self-signed
 * TLS cert in dev / staging (e.g. `https://localhost:8000` from an EC2 box).
 * The raw helper sets `rejectUnauthorized: false` so the request still goes
 * through; the trade-off is acceptable because the call is locked to the
 * MJFP_APPROVE_URL host configured in env, not user-controlled input.
 */
export const approvePreInfluencer = async (params: {
  inviteCode: string;
  email: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error("approvePreInfluencer requires inviteCode");
  }
  if (!params.email) {
    throw new Error("approvePreInfluencer requires invitee_email");
  }
  const token = process.env.MJFP_TOKEN;
  if (!token) return null;

  const result = await postRawJson(
    MJFP_APPROVE_URL,
    {
      invite_code: params.inviteCode,
      invitee_email: params.email,
    },
    {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Internal-Token": token,
    },
    TEASEME_APPROVE_TIMEOUT_MS,
    "mjfp.approve",
  );
  if (!result) return null;
  if (result.status < 200 || result.status >= 300) return null;

  const raw =
    result.body && typeof result.body === "object"
      ? (result.body as Record<string, unknown>)
      : {};
  const upstreamOk = typeof raw.ok === "boolean" ? raw.ok : null;
  if (upstreamOk === false) return null;
  const statusStr =
    typeof raw.status === "string" && raw.status ? raw.status : null;
  return { ok: true, status: statusStr, raw: result.body };
};

/** Notify TeaseMe that a chatter group was assigned to the (now active) promoter. */
export const notifyChattersAssigned = async (params: {
  inviteCode: string;
  email?: string;
  chatterGroupId: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error("notifyChattersAssigned requires inviteCode");
  }
  if (!params.chatterGroupId) {
    throw new Error("notifyChattersAssigned requires chatterGroupId");
  }
  const body: Record<string, unknown> = {
    invite_code: params.inviteCode,
    chatter_group_id: params.chatterGroupId,
  };
  if (params.email) body.invitee_email = params.email;
  return postToTeaseme(TEASEME_ASSIGN_CHATTERS_URL, body);
};

export interface TeaseMeSocialLink {
  platform: string;
  url: string;
}

export interface TeaseMeInfluencer {
  voice_id?: string | null;
  // TeaseMe currently nests `social_links` inside `bio_json`, but older profiles
  // (and some staging environments) return it at the top level. We read both.
  social_links?: TeaseMeSocialLink[] | null;
  bio_json?: {
    social_links?: TeaseMeSocialLink[] | null;
    [key: string]: unknown;
  } | null;
  profile_photo_key?: string | null;
  profile_video_key?: string | null;
}

/**
 * TeaseMe returns `social_links` at two possible locations depending on the
 * influencer's profile shape. Prefer the top-level list when non-empty;
 * otherwise fall back to the list nested under `bio_json`.
 */
export const extractSocialLinks = (
  influencer: TeaseMeInfluencer,
): TeaseMeSocialLink[] => {
  if (
    Array.isArray(influencer.social_links) &&
    influencer.social_links.length > 0
  ) {
    return influencer.social_links;
  }
  const nested = influencer.bio_json?.social_links;
  if (Array.isArray(nested)) return nested;
  return [];
};

export class TeaseMeApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "TeaseMeApiError";
  }
}

export class TeaseMeSyncValidationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404,
  ) {
    super(message);
    this.name = "TeaseMeSyncValidationError";
  }
}

/**
 * Fetches an influencer profile from the TeaseMe public API.
 * Throws TeaseMeApiError on non-2xx responses or network failures.
 */
export const fetchInfluencer = async (
  usernameOrId: string,
): Promise<TeaseMeInfluencer> => {
  if (!usernameOrId) {
    throw new TeaseMeApiError("Missing username/id");
  }

  const url = `${TEASEME_API_URL}/influencer/${encodeURIComponent(usernameOrId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new TeaseMeApiError(
      `TeaseMe request failed: ${(err as Error).message}`,
    );
  }

  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new TeaseMeApiError(
      `TeaseMe API returned ${res.status} for ${usernameOrId}`,
      res.status,
      body,
    );
  }

  const data = (await res.json()) as TeaseMeInfluencer;
  return data;
};

export interface SyncedUser {
  id: string;
  username: string | null;
  voiceId: string | null;
  profilePhotoKey: string | null;
  profileVideoKey: string | null;
  teasemeSyncedAt: Date | null;
  socialLinks: { platform: string; url: string }[];
}

const normalizeSocialUrl = (rawUrl: string): string | null => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

// We only surface these four platforms in the UI — everything else returned by TeaseMe
// is dropped during sync so the DB stays aligned with what we can render.
const ALLOWED_SOCIAL_PLATFORMS = new Set([
  "bluesky",
  "instagram",
  "tiktok",
  "onlyfans",
]);

// Map incoming platform aliases to our canonical keys.
const normalizeSocialPlatform = (raw: string): string | null => {
  const key = String(raw).toLowerCase().trim();
  if (!key) return null;
  switch (key) {
    case "ig":
    case "insta":
    case "instagram":
      return "instagram";
    case "tt":
    case "tiktok":
      return "tiktok";
    case "bluesky":
    case "bsky":
      return "bluesky";
    case "of":
    case "onlyfans":
      return "onlyfans";
    default:
      return ALLOWED_SOCIAL_PLATFORMS.has(key) ? key : null;
  }
};

/**
 * Syncs a User row with data from TeaseMe, keyed by the user's username.
 * Updates voiceId, S3 keys, teasemeSyncedAt and replaces the user's socialLinks.
 */
export const syncUserFromTeaseMe = async (
  userId: string,
): Promise<SyncedUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new TeaseMeSyncValidationError(`User ${userId} not found`, 404);
  }
  if (!user.username) {
    throw new TeaseMeSyncValidationError(
      `User ${userId} has no username; cannot sync`,
      400,
    );
  }

  const influencer = await fetchInfluencer(user.username);
  const rawLinks = extractSocialLinks(influencer);

  // Dedupe by platform (TeaseMe may return duplicates), normalise the platform key,
  // drop anything outside our supported whitelist, and validate the URL.
  const byPlatform = new Map<string, string>();
  const rejected: { reason: string; platform?: string; url?: string }[] = [];
  for (const link of rawLinks) {
    if (!link?.platform || !link?.url) {
      rejected.push({
        reason: "missing platform or url",
        platform: link?.platform,
        url: link?.url,
      });
      continue;
    }
    const platform = normalizeSocialPlatform(link.platform);
    if (!platform) {
      rejected.push({
        reason: "platform not in whitelist",
        platform: link.platform,
      });
      continue;
    }
    const url = normalizeSocialUrl(String(link.url));
    if (!url) {
      rejected.push({ reason: "invalid url", platform, url: link.url });
      continue;
    }
    if (!byPlatform.has(platform)) byPlatform.set(platform, url);
  }

  console.info(
    `[teaseme.sync] user=${user.username} raw=${rawLinks.length} kept=${byPlatform.size}` +
      (rejected.length ? ` rejected=${JSON.stringify(rejected)}` : ""),
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        voiceId: influencer.voice_id ?? null,
        profilePhotoKey: influencer.profile_photo_key ?? null,
        profileVideoKey: influencer.profile_video_key ?? null,
        teasemeSyncedAt: new Date(),
      },
    });

    const deleted = await tx.socialLink.deleteMany({ where: { userId } });
    let insertedCount = 0;
    if (byPlatform.size > 0) {
      const result = await tx.socialLink.createMany({
        data: Array.from(byPlatform.entries()).map(([platform, url]) => ({
          userId,
          platform,
          url,
        })),
      });
      insertedCount = result.count;
    }
    console.info(
      `[teaseme.sync] user=${user.username} deleted=${deleted.count} inserted=${insertedCount} ` +
        `platforms=[${Array.from(byPlatform.keys()).join(",")}]`,
    );

    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        voiceId: true,
        profilePhotoKey: true,
        profileVideoKey: true,
        teasemeSyncedAt: true,
        socialLinks: {
          select: { platform: true, url: true },
          orderBy: { platform: "asc" },
        },
      },
    });
  });

  return updated;
};
