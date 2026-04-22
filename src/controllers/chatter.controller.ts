import { PrismaClient, UserRole, UserType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { validationResult } from "express-validator";
import { nanoid } from "nanoid";
import { AuthRequest } from "../middleware/auth.middleware";
import { getPresignedUrl } from "../services/s3.service";
import { syncUserFromTeaseMe } from "../services/teaseme.service";

const prisma = new PrismaClient();
const PREREGISTER_URL =
  process.env.PREREGISTER_VIP_TEASEME_USER ||
  process.env.VITE_PREREGISTER_VIP_TEASEME_USER;
const PREREGISTER_TOKEN =
  process.env.MJFP_TOKEN || process.env.VITE_MJFP_TOKEN;

const isAccountManagerOrAdmin = (req: AuthRequest): boolean => {
  if (!req.user) return false;
  return (
    req.user.role === UserRole.ADMIN ||
    req.user.userType === UserType.ACCOUNT_MANAGER
  );
};

const isAdmin = (req: AuthRequest): boolean =>
  req.user?.role === UserRole.ADMIN || req.user?.userType === UserType.ADMIN;

// A chatter is considered "owned" by an AM when either:
//   (a) the AM created them (users.createdById), or
//   (b) the chatter is a member of a group the AM created.
// (b) keeps legacy chatters (created before we tracked `createdById`) visible
// to whichever AM actually works with them.
const chattersOwnedByWhere = (accountManagerId: string) => ({
  userType: UserType.CHATTER,
  OR: [
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

    const { email, password, firstName, lastName } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res
        .status(400)
        .json({ error: "A user with that email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const inviteCode = nanoid(10);

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
        createdById: req.user!.id,
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

    res.status(201).json({ chatter, message: "Chatter created successfully" });
  } catch (error) {
    console.error("Create chatter error:", error);
    res.status(500).json({ error: "Failed to create chatter" });
  }
};

type PreregisterPayload = {
  email: string;
  influencer_id: string;
  telegram_id: number;
  full_name: string;
};

type PreregisterUpstream =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

const callPreregisterUpstream = async (
  payload: PreregisterPayload,
): Promise<PreregisterUpstream> => {
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(PREREGISTER_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": PREREGISTER_TOKEN!,
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
    const detail =
      parsed && typeof parsed.detail === "string" ? parsed.detail : "";
    return {
      ok: false,
      status: upstream.status,
      error: detail || `Preregistration failed (HTTP ${upstream.status})`,
    };
  }

  if (!parsed || typeof parsed.verification_url !== "string") {
    return {
      ok: false,
      status: 502,
      error: "Unexpected response from preregistration service",
    };
  }

  return { ok: true, body: parsed };
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

    if (!PREREGISTER_URL || !PREREGISTER_TOKEN) {
      return res
        .status(503)
        .json({ error: "Preregistration service is not configured" });
    }

    const telegramId = Number(req.body.telegram_id);
    if (!Number.isInteger(telegramId) || telegramId < 1) {
      return res
        .status(422)
        .json({ error: "telegram_id must be a positive integer" });
    }

    const payload: PreregisterPayload = {
      email: String(req.body.email).trim(),
      influencer_id: String(req.body.influencer_id).trim(),
      telegram_id: telegramId,
      full_name: String(req.body.full_name).trim(),
    };

    const result = await callPreregisterUpstream(payload);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.body);
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
      const lastSyncedAt = p.teasemeSyncedAt ? p.teasemeSyncedAt.getTime() : null;
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
