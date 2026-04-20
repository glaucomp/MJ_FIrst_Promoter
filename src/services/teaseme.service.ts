import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEASEME_API_URL = (process.env.TEASEME_API_URL || 'https://api.teaseme.live').replace(/\/$/, '');

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
 * influencer's profile shape. Prefer the top-level list if present, otherwise
 * fall back to the list nested under `bio_json`.
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
