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

let cached: MjfpCredentials | null = null;

/**
 * Returns the active MJFP Bearer token and Account-ID from the api_keys table.
 * Results are cached in-process for the lifetime of the server to avoid
 * repeated DB round-trips on hot paths.
 *
 * Returns null if no active MJFP api key is found in the database.
 */
export async function getMjfpCredentials(): Promise<MjfpCredentials | null> {
  if (cached) return cached;

  const row = await prisma.apiKey.findFirst({
    where: {
      token: { startsWith: "fp_token_" },
      isActive: true,
    },
    select: { token: true, accountId: true },
  });

  if (!row?.token || !row?.accountId) return null;

  cached = { token: row.token, accountId: row.accountId };
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
