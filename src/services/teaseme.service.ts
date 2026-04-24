import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEASEME_API_URL = (process.env.TEASEME_API_URL || 'https://api.teaseme.live').replace(/\/$/, '');

// TeaseMe lifecycle lookup for the pre-user polling flow. Hitting this with a
// referral's email + inviteCode tells us which onboarding step the invitee is
// on inside TeaseMe so the My Promoters list can render a "Step N" chip while
// the user hasn't yet registered on our side.
//
// Upstream contract (POST JSON):
//   POST {TEASEME_STATUS_URL}
//   Headers: { "Content-Type": "application/json", "X-Internal-Token": <MJFP_TOKEN> }
//   Body:    { "invite_code": "...", "new_user_email": "..." }
//   200:     { ok, exists, pre_influencer_id, username, survey_step, status }
const TEASEME_STATUS_URL = (
  process.env.TEASEME_STATUS_URL
    || 'https://tmapi.mxjprod.work/mjpromoter/pre-influencers/step-progress'
).replace(/\/$/, '');
const TEASEME_STATUS_TIMEOUT_MS = 3_000;

export interface TeasemePreUserStatus {
  step: number;
  active: boolean;
  teasemeUserId: string | null;
  username: string | null;
  status: string | null;
}

/**
 * Look up a pre-registered user's TeaseMe onboarding status. At least one of
 * `email` / `inviteCode` must be provided. Returns `null` on 404 / non-2xx /
 * timeout / network error / `exists: false` so callers can keep the
 * last-known state rather than propagating upstream outages to the UI.
 */
export const fetchTeasemePreUserStatus = async (
  params: { email?: string; inviteCode?: string },
): Promise<TeasemePreUserStatus | null> => {
  const email = params.email?.trim() || '';
  const inviteCode = params.inviteCode?.trim() || '';
  if (!email && !inviteCode) {
    throw new Error('fetchTeasemePreUserStatus requires email or inviteCode');
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
  if (email) payload.new_user_email = email;

  let res: Response;
  try {
    res = await fetch(TEASEME_STATUS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Internal-Token': token,
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
  if (!body || typeof body !== 'object') return null;

  const raw = body as Record<string, unknown>;

  // Upstream signals "no record" via `ok: false` or `exists: false` instead
  // of a 404 — treat both as a miss so we don't overwrite cached state.
  if (raw.ok === false) return null;
  if (raw.exists === false) return null;

  const surveyStep =
    typeof raw.survey_step === 'number'
      ? raw.survey_step
      : Number(raw.survey_step);
  if (!Number.isFinite(surveyStep)) return null;

  const statusStr =
    typeof raw.status === 'string' && raw.status ? raw.status : null;

  const preInfluencerId = raw.pre_influencer_id;
  const teasemeUserId =
    typeof preInfluencerId === 'string' && preInfluencerId
      ? preInfluencerId
      : typeof preInfluencerId === 'number' && Number.isFinite(preInfluencerId)
        ? String(preInfluencerId)
        : null;

  return {
    step: Math.max(0, Math.trunc(surveyStep)),
    // Upstream uses `status: "pending" | "active" | ...`. Anything that is
    // not explicitly "pending" (and exists) counts as active for UI badges.
    active: statusStr !== null && statusStr !== 'pending',
    teasemeUserId,
    username:
      typeof raw.username === 'string' && raw.username ? raw.username : null,
    status: statusStr,
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
  process.env.TEASEME_DENY_URL
    || 'https://tmapi.mxjprod.work/mjpromoter/pre-influencers/deny'
).replace(/\/$/, '');
const TEASEME_REASSIGN_URL = (
  process.env.TEASEME_REASSIGN_URL
    || 'https://tmapi.mxjprod.work/mjpromoter/pre-influencers/reassign'
).replace(/\/$/, '');
const TEASEME_ORDER_LP_URL = (
  process.env.TEASEME_ORDER_LP_URL
    || 'https://tmapi.mxjprod.work/mjpromoter/pre-influencers/order-landing-page'
).replace(/\/$/, '');
const TEASEME_ASSIGN_CHATTERS_URL = (
  process.env.TEASEME_ASSIGN_CHATTERS_URL
    || 'https://tmapi.mxjprod.work/mjpromoter/pre-influencers/assign-chatters'
).replace(/\/$/, '');

export interface TeasemeActionResult {
  ok: boolean;
  status?: string | null;
  raw?: unknown;
}

const postToTeaseme = async (
  url: string,
  body: Record<string, unknown>,
): Promise<TeasemeActionResult | null> => {
  const token = process.env.MJFP_TOKEN;
  if (!token) return null;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Internal-Token': token,
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
    parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  const statusStr =
    typeof raw.status === 'string' && raw.status ? raw.status : null;
  return { ok: true, status: statusStr, raw: parsed };
};

/** Deny a pending pre-influencer invite on TeaseMe's side. */
export const denyPreInfluencer = async (params: {
  inviteCode: string;
  email?: string;
  reason?: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error('denyPreInfluencer requires inviteCode');
  }
  const body: Record<string, unknown> = { invite_code: params.inviteCode };
  if (params.email) body.new_user_email = params.email;
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
    throw new Error('reassignPreInfluencer requires inviteCode');
  }
  if (!params.newManagerEmail) {
    throw new Error('reassignPreInfluencer requires newManagerEmail');
  }
  const body: Record<string, unknown> = {
    invite_code: params.inviteCode,
    new_manager_email: params.newManagerEmail,
  };
  if (params.email) body.new_user_email = params.email;
  return postToTeaseme(TEASEME_REASSIGN_URL, body);
};

/** Request TeaseMe to start building the landing page for this invite. */
export const orderLandingPageForPreInfluencer = async (params: {
  inviteCode: string;
  email?: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error('orderLandingPageForPreInfluencer requires inviteCode');
  }
  const body: Record<string, unknown> = { invite_code: params.inviteCode };
  if (params.email) body.new_user_email = params.email;
  return postToTeaseme(TEASEME_ORDER_LP_URL, body);
};

/** Notify TeaseMe that a chatter group was assigned to the (now active) promoter. */
export const notifyChattersAssigned = async (params: {
  inviteCode: string;
  email?: string;
  chatterGroupId: string;
}): Promise<TeasemeActionResult | null> => {
  if (!params.inviteCode) {
    throw new Error('notifyChattersAssigned requires inviteCode');
  }
  if (!params.chatterGroupId) {
    throw new Error('notifyChattersAssigned requires chatterGroupId');
  }
  const body: Record<string, unknown> = {
    invite_code: params.inviteCode,
    chatter_group_id: params.chatterGroupId,
  };
  if (params.email) body.new_user_email = params.email;
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
  influencer: TeaseMeInfluencer
): TeaseMeSocialLink[] => {
  if (Array.isArray(influencer.social_links) && influencer.social_links.length > 0) {
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
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'TeaseMeApiError';
  }
}

export class TeaseMeSyncValidationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404
  ) {
    super(message);
    this.name = 'TeaseMeSyncValidationError';
  }
}

/**
 * Fetches an influencer profile from the TeaseMe public API.
 * Throws TeaseMeApiError on non-2xx responses or network failures.
 */
export const fetchInfluencer = async (
  usernameOrId: string
): Promise<TeaseMeInfluencer> => {
  if (!usernameOrId) {
    throw new TeaseMeApiError('Missing username/id');
  }

  const url = `${TEASEME_API_URL}/influencer/${encodeURIComponent(usernameOrId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new TeaseMeApiError(
      `TeaseMe request failed: ${(err as Error).message}`
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
      body
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
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

// We only surface these four platforms in the UI — everything else returned by TeaseMe
// is dropped during sync so the DB stays aligned with what we can render.
const ALLOWED_SOCIAL_PLATFORMS = new Set(['bluesky', 'instagram', 'tiktok', 'onlyfans']);

// Map incoming platform aliases to our canonical keys.
const normalizeSocialPlatform = (raw: string): string | null => {
  const key = String(raw).toLowerCase().trim();
  if (!key) return null;
  switch (key) {
    case 'ig':
    case 'insta':
    case 'instagram':
      return 'instagram';
    case 'tt':
    case 'tiktok':
      return 'tiktok';
    case 'bluesky':
    case 'bsky':
      return 'bluesky';
    case 'of':
    case 'onlyfans':
      return 'onlyfans';
    default:
      return ALLOWED_SOCIAL_PLATFORMS.has(key) ? key : null;
  }
};

/**
 * Syncs a User row with data from TeaseMe, keyed by the user's username.
 * Updates voiceId, S3 keys, teasemeSyncedAt and replaces the user's socialLinks.
 */
export const syncUserFromTeaseMe = async (
  userId: string
): Promise<SyncedUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new TeaseMeSyncValidationError(`User ${userId} not found`, 404);
  }
  if (!user.username) {
    throw new TeaseMeSyncValidationError(`User ${userId} has no username; cannot sync`, 400);
  }

  const influencer = await fetchInfluencer(user.username);
  const rawLinks = extractSocialLinks(influencer);

  // Dedupe by platform (TeaseMe may return duplicates), normalise the platform key,
  // drop anything outside our supported whitelist, and validate the URL.
  const byPlatform = new Map<string, string>();
  const rejected: { reason: string; platform?: string; url?: string }[] = [];
  for (const link of rawLinks) {
    if (!link?.platform || !link?.url) {
      rejected.push({ reason: 'missing platform or url', platform: link?.platform, url: link?.url });
      continue;
    }
    const platform = normalizeSocialPlatform(link.platform);
    if (!platform) {
      rejected.push({ reason: 'platform not in whitelist', platform: link.platform });
      continue;
    }
    const url = normalizeSocialUrl(String(link.url));
    if (!url) {
      rejected.push({ reason: 'invalid url', platform, url: link.url });
      continue;
    }
    if (!byPlatform.has(platform)) byPlatform.set(platform, url);
  }

  console.info(
    `[teaseme.sync] user=${user.username} raw=${rawLinks.length} kept=${byPlatform.size}` +
      (rejected.length ? ` rejected=${JSON.stringify(rejected)}` : '')
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
        `platforms=[${Array.from(byPlatform.keys()).join(',')}]`
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
          orderBy: { platform: 'asc' },
        },
      },
    });
  });

  return updated;
};
