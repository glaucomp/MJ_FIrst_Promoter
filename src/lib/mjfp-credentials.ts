import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * MJFP API URL — the MJ First Promoter Python service base URL.
 * Can be overridden via MJFP_API_URL env var for staging/dev environments.
 */
export const MJFP_API_URL =
  process.env.MJFP_API_URL ?? "https://www.mjpromoter.com/api";

interface MjfpCredentials {
  token: string;
  accountId: string;
}

/** Re-fetch from the DB at most once every 5 minutes. */
const CACHE_TTL_MS = 5 * 60 * 1_000;

let cached: MjfpCredentials | null = null;
let cachedAt = 0;

/**
 * Invalidates the in-process credentials cache.
 * Call this whenever an upstream request returns 401 so the next call
 * to getMjfpCredentials() re-reads from the DB rather than reusing a
 * stale/rotated token.
 */
export function clearMjfpCredentialsCache(): void {
  cached = null;
  cachedAt = 0;
}

/**
 * Returns the active MJFP Bearer token and Account-ID from the api_keys table.
 * Results are cached in-process for up to CACHE_TTL_MS to avoid repeated DB
 * round-trips on hot paths.  The cache is also invalidated via
 * clearMjfpCredentialsCache() when an upstream 401 is detected.
 *
 * Returns null if no active MJFP api key is found in the database.
 */
export async function getMjfpCredentials(): Promise<MjfpCredentials | null> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  const row = await prisma.apiKey.findFirst({
    where: {
      token: { startsWith: "fp_token_" },
      isActive: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { token: true, accountId: true },
  });

  if (!row?.token || !row?.accountId) return null;

  cached = { token: row.token, accountId: row.accountId };
  cachedAt = Date.now();
  return cached;
}

/**
 * Returns only the bearer token (used as X-Internal-Token for TeaseMe calls).
 * Returns null if no active MJFP api key is found.
 */
export async function getMjfpToken(): Promise<string | null> {
  const creds = await getMjfpCredentials();
  return creds?.token ?? null;
}
