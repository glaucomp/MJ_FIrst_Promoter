import http from "node:http";
import https from "node:https";

import { PrismaClient } from "@prisma/client";
import { clearMjfpCredentialsCache, getMjfpToken } from "../lib/mjfp-credentials";

const prisma = new PrismaClient();

const TEASEME_API_URL = (
  process.env.TEASEME_API_URL || "https://api.teaseme.live"
).replace(/\/$/, "");

// TeaseMe lifecycle lookup for the pre-user polling flow. Hitting this with a
// referral's email + inviteCode tells us which onboarding step the invitee is
// on inside TeaseMe so the My Promoters list can render a "Step N" chip while
// the user hasn't yet registered on our side.
//
// Upstream contract (POST JSON) — see docs/TEASEME_STEP_PROGRESS.md.
//   POST {TEASEME_STATUS_URL}
//   Headers: { "Content-Type": "application/json", "X-Internal-Token": <MJFP_TOKEN> }
//   Body:    { "invite_code": "...", "invitee_email": "..." }
//   200:     { ok, exists, pre_influencer_id, username, survey_step, status,
//              survey_link, asset_link,
//              photo_complete?, voice_complete?, social_complete? }
//
//   `survey_step` = completed milestone count 0–3 (not active-section index):
//     1 → register done (country, languages, ≥1 social_* in survey_answers)
//     2 → + profile photo and ≥1 audio
//     3 → + terms_agreement and assets_complete (asset_link NOT required)
//   `survey_link` → resume onboarding at photo step (start_step=picture); no quiz.
//   `asset_link` → published LP URL when ready; separate from survey_step 3.
// Read lazily so dotenv.config() in server.ts has already run by the time
// the first request fires (module-level constants are evaluated before
// dotenv runs because imports are hoisted ahead of dotenv.config()).
const getTeasemeStatusUrl = () =>
  (
    process.env.TEASEME_STATUS_URL ||
    "https://tmapi.mxjprod.work/mjpromoter/pre-influencers/step-progress"
  ).replace(/\/$/, "");
const TEASEME_STATUS_TIMEOUT_MS = 10_000;
// The approve call kicks off real work upstream (LP provisioning + DB writes
// + email triggers) and routinely takes longer than the cheap /step-progress
// lookup. Bumped to 30s so a slow upstream doesn't get aborted client-side
// and surface as a misleading "TeaseMe couldn't start the landing-page build"
// toast while the work was actually in progress.
const TEASEME_APPROVE_TIMEOUT_MS = 30_000;

const getTeasemeVipUserStatusUrl = () =>
  (
    process.env.TEASEME_VIP_USER_STATUS_URL ||
    `${getTeasemeMjpromoterBaseUrl()}/vip-user-status`
  ).replace(/\/$/, "");

const getTeasemeVipInvitesStatusUrl = () =>
  (
    process.env.TEASEME_VIP_INVITES_STATUS_URL ||
    `${getTeasemeMjpromoterBaseUrl()}/vip-invites/status`
  ).replace(/\/$/, "");

/** Base URL for MJ Promoter internal routes on the TeaseMe API host. */
export const getTeasemeMjpromoterBaseUrl = (): string => {
  const explicit = process.env.TEASEME_MJPROMOTER_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const prereg =
    process.env.PREREGISTER_VIP_TEASEME_USER ||
    process.env.VITE_PREREGISTER_VIP_TEASEME_USER;
  if (prereg) {
    try {
      return `${new URL(prereg).origin}/mjpromoter`;
    } catch {
      // fall through
    }
  }

  return "https://tmapi.mxjprod.work/mjpromoter";
};

const getTeasemeVipInviteSendEmailUrl = () =>
  (
    process.env.TEASEME_VIP_INVITE_SEND_EMAIL_URL ||
    `${getTeasemeMjpromoterBaseUrl()}/vip-invites/send-email`
  ).replace(/\/$/, "");

export const getTeasemeVipInviteEmailAssetsUrl = (influencerId: string) =>
  (
    process.env.TEASEME_VIP_INVITE_EMAIL_ASSETS_URL?.replace(
      "{influencer_id}",
      encodeURIComponent(influencerId),
    ) ||
    `${getTeasemeMjpromoterBaseUrl()}/influencers/${encodeURIComponent(influencerId)}/vip-invite-email-assets`
  ).replace(/\/$/, "");

export type SendVipInviteEmailPayload = {
  to_email: string;
  invite_code: string;
  influencer_id: string;
  /** Invitee first name for greeting; TeaseMe uses "Hi there," when omitted. */
  recipient_name?: string;
};

export type SendVipInviteEmailResult =
  | {
      ok: true;
      message_id?: string | null;
      email_subject?: string | null;
      message: string;
    }
  | { ok: false; status: number; error: string };

const pickTeasemeError = (parsed: Record<string, unknown> | null): string => {
  if (!parsed) return "";
  for (const key of ["error", "message", "detail"] as const) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

/**
 * POST /mjpromoter/vip-invites/send-email — TeaseMe SES VIP invite template.
 */
export const sendVipInviteEmailViaTeaseme = async (
  payload: SendVipInviteEmailPayload,
): Promise<SendVipInviteEmailResult> => {
  const toEmail = payload.to_email.trim();
  const inviteCode = payload.invite_code.trim();
  const influencerId = payload.influencer_id.trim();
  const recipientName = payload.recipient_name?.trim();

  if (!toEmail || !inviteCode || !influencerId) {
    return {
      ok: false,
      status: 422,
      error: "to_email, invite_code, and influencer_id are required",
    };
  }

  const token = await getMjfpToken();
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: "TeaseMe service is not configured",
    };
  }

  const url = getTeasemeVipInviteSendEmailUrl();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify({
        to_email: toEmail,
        invite_code: inviteCode,
        influencer_id: influencerId,
        ...(recipientName ? { recipient_name: recipientName } : {}),
      }),
      signal: AbortSignal.timeout(TEASEME_STATUS_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Could not reach TeaseMe email service",
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const parsed =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;

  if (res.status === 401) clearMjfpCredentialsCache();

  if (!res.ok) {
    const detail = pickTeasemeError(parsed);
    if (res.status === 502 || detail.toLowerCase().includes("ses")) {
      return {
        ok: false,
        status: 502,
        error:
          detail ||
          "Failed to send VIP invite email. Check SES configuration.",
      };
    }
    return {
      ok: false,
      status: res.status,
      error: detail || `Failed to send VIP invite email (HTTP ${res.status})`,
    };
  }

  const messageId =
    parsed && typeof parsed.message_id === "string" ? parsed.message_id : null;
  const emailSubject =
    parsed && typeof parsed.email_subject === "string"
      ? parsed.email_subject
      : null;
  const upstreamMessage =
    parsed && typeof parsed.message === "string" ? parsed.message : null;

  return {
    ok: true,
    message_id: messageId,
    email_subject: emailSubject,
    message:
      upstreamMessage ||
      (emailSubject
        ? `Invite email sent (${emailSubject}).`
        : `Invite email sent to ${toEmail}.`),
  };
};

export interface TeasemeVipUserStatus {
  found: boolean;
  user_id?: number;
  telegram_id?: number;
  email?: string | null;
  full_name?: string | null;
  status?: string;
  is_verified?: boolean;
  first_login_at?: string | null;
  preregistered_at?: string | null;
  updated_at?: string | null;
}

export type TeasemeVipInviteStatusRow = {
  user_id?: number;
  invite_code?: string;
  status?: string;
  expires_at?: string | null;
  instagram_username?: string | null;
  email?: string | null;
  full_name?: string | null;
  telegram_id?: number | null;
  is_verified?: boolean;
};

export type VipInviteStatusBatchRequest = {
  inviteCodes?: string[];
  userIds?: number[];
};

export type VipInviteStatusBatchResult = {
  byUserId: Map<number, TeasemeVipInviteStatusRow>;
  byInviteCode: Map<string, TeasemeVipInviteStatusRow>;
};

export const normalizeVipInviteCode = (code: string): string =>
  code.trim().toUpperCase();

const parseVipInviteStatusRow = (
  raw: Record<string, unknown>,
): TeasemeVipInviteStatusRow | null => {
  const userId = raw.user_id;
  const inviteCode =
    typeof raw.invite_code === "string" ? raw.invite_code.trim() : undefined;
  const hasUserId =
    typeof userId === "number" && Number.isInteger(userId) && userId > 0;

  if (!hasUserId && !inviteCode) return null;

  return {
    ...(hasUserId ? { user_id: userId } : {}),
    invite_code: inviteCode,
    status: typeof raw.status === "string" ? raw.status : undefined,
    expires_at:
      typeof raw.expires_at === "string" ? raw.expires_at : null,
    instagram_username:
      typeof raw.instagram_username === "string"
        ? raw.instagram_username
        : null,
    email: typeof raw.email === "string" ? raw.email : null,
    full_name: typeof raw.full_name === "string" ? raw.full_name : null,
    telegram_id:
      typeof raw.telegram_id === "number" ? raw.telegram_id : null,
    is_verified:
      typeof raw.is_verified === "boolean" ? raw.is_verified : undefined,
  };
};

const extractVipInviteStatusRows = (body: unknown): unknown[] => {
  if (!body || typeof body !== "object") return [];
  const raw = body as Record<string, unknown>;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.invites)) return raw.invites;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(body)) return body;
  if (typeof raw.status === "string" || typeof raw.invite_code === "string") {
    return [raw];
  }
  return [];
};

const indexVipInviteStatusRows = (
  rows: TeasemeVipInviteStatusRow[],
): VipInviteStatusBatchResult => {
  const byUserId = new Map<number, TeasemeVipInviteStatusRow>();
  const byInviteCode = new Map<string, TeasemeVipInviteStatusRow>();

  for (const row of rows) {
    if (row.user_id && row.user_id > 0) {
      byUserId.set(row.user_id, row);
    }
    if (row.invite_code) {
      byInviteCode.set(normalizeVipInviteCode(row.invite_code), row);
    }
  }

  return { byUserId, byInviteCode };
};

/**
 * Batch VIP invite status lookup — POST /mjpromoter/vip-invites/status.
 * Prefer invite_codes (persistent VIP code); user_ids are sent as fallback.
 */
export const fetchVipInviteStatusesBatch = async (
  request: VipInviteStatusBatchRequest,
): Promise<VipInviteStatusBatchResult> => {
  const inviteCodes = [
    ...new Set(
      (request.inviteCodes ?? [])
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ];
  const userIds = [
    ...new Set(
      (request.userIds ?? []).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  const empty = indexVipInviteStatusRows([]);
  if (inviteCodes.length === 0 && userIds.length === 0) return empty;

  const token = await getMjfpToken();
  if (!token) return empty;

  const payload: Record<string, unknown> = {};
  if (inviteCodes.length > 0) payload.invite_codes = inviteCodes;
  if (userIds.length > 0) payload.user_ids = userIds;

  let res: Response;
  try {
    res = await fetch(getTeasemeVipInvitesStatusUrl(), {
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
    return empty;
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return empty;
  }

  if (res.status === 401) clearMjfpCredentialsCache();
  if (res.status < 200 || res.status >= 300) return empty;

  const parsedRows: TeasemeVipInviteStatusRow[] = [];
  for (const entry of extractVipInviteStatusRows(body)) {
    if (!entry || typeof entry !== "object") continue;
    const parsed = parseVipInviteStatusRow(entry as Record<string, unknown>);
    if (parsed) parsedRows.push(parsed);
  }

  return indexVipInviteStatusRows(parsedRows);
};

/** Poll TeaseMe VIP preregister status for webhook-miss reconciliation. */
export const fetchVipUserStatus = async (
  userId: number,
): Promise<TeasemeVipUserStatus | null> => {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("fetchVipUserStatus requires a positive integer userId");
  }

  const token = await getMjfpToken();
  if (!token) return null;

  const url = `${getTeasemeVipUserStatusUrl()}?user_id=${encodeURIComponent(String(userId))}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      signal: AbortSignal.timeout(TEASEME_STATUS_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  if (res.status === 401) clearMjfpCredentialsCache();
  if (res.status < 200 || res.status >= 300) return null;
  if (!body || typeof body !== "object") return null;

  const raw = body as Record<string, unknown>;
  if (raw.found === false) {
    return { found: false };
  }
  if (raw.found !== true) return null;

  return {
    found: true,
    user_id: typeof raw.user_id === "number" ? raw.user_id : undefined,
    telegram_id:
      typeof raw.telegram_id === "number" ? raw.telegram_id : undefined,
    email: typeof raw.email === "string" ? raw.email : null,
    full_name: typeof raw.full_name === "string" ? raw.full_name : null,
    status: typeof raw.status === "string" ? raw.status : undefined,
    is_verified:
      typeof raw.is_verified === "boolean" ? raw.is_verified : undefined,
    first_login_at:
      typeof raw.first_login_at === "string" ? raw.first_login_at : null,
    preregistered_at:
      typeof raw.preregistered_at === "string" ? raw.preregistered_at : null,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
};

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
  // Optional sub-checklist flags (UI-only when upstream sends them).
  photoComplete: boolean | null;
  voiceComplete: boolean | null;
  socialComplete: boolean | null;
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

  const token = await getMjfpToken();
  if (!token) {
    // Without the shared token the upstream will refuse every request — fail
    // open so the list still renders instead of looping on 401s.
    return null;
  }

  const payload: Record<string, string> = {};
  if (inviteCode) payload.invite_code = inviteCode;
  if (email) payload.invitee_email = email;

  let body: unknown = null;
  try {
    const httpRes = await postRawJson(
      getTeasemeStatusUrl(),
      payload,
      {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      TEASEME_STATUS_TIMEOUT_MS,
      "teaseme.step-progress",
    );
    if (!httpRes) return null;
    if (httpRes.status === 401) clearMjfpCredentialsCache();
    if (httpRes.status < 200 || httpRes.status >= 300) return null;
    body = httpRes.body;
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

  const readOptionalBool = (key: string): boolean | null => {
    const v = raw[key];
    return typeof v === "boolean" ? v : null;
  };

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
    photoComplete: readOptionalBool("photo_complete"),
    voiceComplete: readOptionalBool("voice_complete"),
    socialComplete: readOptionalBool("social_complete"),
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
const getMjfpApproveUrl = () =>
  (
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
  const token = await getMjfpToken();
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
  if (!res.ok) {
    if (res.status === 401) clearMjfpCredentialsCache();
    return null;
  }
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
  const token = await getMjfpToken();
  if (!token) return null;

  const result = await postRawJson(
    getMjfpApproveUrl(),
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
  if (result.status === 401) clearMjfpCredentialsCache();
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
 *
 * `usernameOverride` lets callers resolve the upstream TeaseMe username out
 * of band (e.g. via /step-progress) and pass it in directly. Needed for the
 * 4→5 promotion flow because our local `User.username` is derived from the
 * email local-part and rarely matches the public TeaseMe handle, so the
 * naive `fetchInfluencer(user.username)` lookup 404s.
 */
export const syncUserFromTeaseMe = async (
  userId: string,
  usernameOverride?: string | null,
): Promise<SyncedUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new TeaseMeSyncValidationError(`User ${userId} not found`, 404);
  }
  const lookupKey = usernameOverride?.trim() || user.username;
  if (!lookupKey) {
    throw new TeaseMeSyncValidationError(
      `User ${userId} has no username; cannot sync`,
      400,
    );
  }

  const influencer = await fetchInfluencer(lookupKey);
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
    `[teaseme.sync] user=${user.username} lookup=${lookupKey} raw=${rawLinks.length} kept=${byPlatform.size}` +
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
      `[teaseme.sync] user=${user.username} lookup=${lookupKey} deleted=${deleted.count} inserted=${insertedCount} ` +
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
