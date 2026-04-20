import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEASEME_API_URL = (process.env.TEASEME_API_URL || 'https://api.teaseme.live').replace(/\/$/, '');

export interface TeaseMeSocialLink {
  platform: string;
  url: string;
}

export interface TeaseMeInfluencer {
  voice_id?: string | null;
  social_links?: TeaseMeSocialLink[] | null;
  profile_photo_key?: string | null;
  profile_video_key?: string | null;
}

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
    throw new TeaseMeApiError(`User ${userId} not found`);
  }
  if (!user.username) {
    throw new TeaseMeApiError(`User ${userId} has no username; cannot sync`);
  }

  const influencer = await fetchInfluencer(user.username);

  // Dedupe by platform (TeaseMe may return duplicates), normalise platform to lowercase.
  const byPlatform = new Map<string, string>();
  for (const link of influencer.social_links || []) {
    if (!link?.platform || !link?.url) continue;
    const platform = String(link.platform).toLowerCase().trim();
    if (!platform) continue;
    if (!byPlatform.has(platform)) byPlatform.set(platform, link.url);
  }

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

    await tx.socialLink.deleteMany({ where: { userId } });
    if (byPlatform.size > 0) {
      await tx.socialLink.createMany({
        data: Array.from(byPlatform.entries()).map(([platform, url]) => ({
          userId,
          platform,
          url,
        })),
      });
    }

    return tx.user.findUnique({
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

  return updated as SyncedUser;
};
