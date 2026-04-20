import { Response } from 'express';
import { PrismaClient, UserRole, UserType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth.middleware';
import { syncUserFromTeaseMe } from '../services/teaseme.service';
import { getPresignedUrl } from '../services/s3.service';

const prisma = new PrismaClient();
const PREREGISTER_URL = process.env.PREREGISTER_VIP_TEASEME_USER;
const PREREGISTER_TOKEN = process.env.MJFP_TOKEN;

const isAccountManagerOrAdmin = (req: AuthRequest): boolean => {
  if (!req.user) return false;
  return (
    req.user.role === UserRole.ADMIN ||
    req.user.userType === UserType.ACCOUNT_MANAGER
  );
};

// POST /api/chatters — create a new chatter (admin or account manager)
export const createChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Only admins or account managers can create chatters' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email, password, firstName, lastName } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'A user with that email already exists' });
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
      },
    });

    res.status(201).json({ chatter, message: 'Chatter created successfully' });
  } catch (error) {
    console.error('Create chatter error:', error);
    res.status(500).json({ error: 'Failed to create chatter' });
  }
};

// POST /api/chatters/preregister-vip — preregister via backend proxy (authenticated)
export const preregisterVipUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.userType !== UserType.CHATTER) {
      return res.status(403).json({ error: 'Only chatters can preregister users' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    if (!PREREGISTER_URL || !PREREGISTER_TOKEN) {
      return res.status(503).json({ error: 'Preregistration service is not configured' });
    }

    const payload = {
      email: String(req.body.email).trim(),
      influencer_id: String(req.body.influencer_id).trim(),
      telegram_id: req.body.telegram_id as number,
      full_name: String(req.body.full_name).trim(),
    };

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(PREREGISTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': PREREGISTER_TOKEN,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return res.status(504).json({ error: 'Preregistration service timed out' });
      }
      return res.status(502).json({ error: 'Could not reach preregistration service' });
    }

    const body = await upstream.json().catch(() => null);
    const parsedBody =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : null;

    if (!upstream.ok) {
      const detail =
        parsedBody && 'detail' in parsedBody
          ? String(parsedBody.detail)
          : '';
      return res.status(upstream.status).json({
        error: detail || `Preregistration failed (HTTP ${upstream.status})`,
      });
    }

    if (
      !parsedBody ||
      !('verification_url' in parsedBody) ||
      typeof parsedBody.verification_url !== 'string'
    ) {
      return res.status(502).json({ error: 'Unexpected response from preregistration service' });
    }

    return res.json(parsedBody);
  } catch (error) {
    console.error('Preregister VIP error:', error);
    return res.status(500).json({ error: 'Failed to preregister user' });
  }
};

// GET /api/chatters/me/groups — list groups the logged-in chatter belongs to
export const getMyGroups = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.userType !== UserType.CHATTER) {
      return res.status(403).json({ error: 'Only chatters can access their groups' });
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

    // Lazy auto-sync: promoters that have never been synced get pulled from TeaseMe.
    // Failures are logged and swallowed so the response is never blocked.
    const toSync = groups
      .map((g) => g.promoter)
      .filter(
        (p): p is NonNullable<typeof p> =>
          !!p && !!p.username && p.teasemeSyncedAt === null
      );

    if (toSync.length > 0) {
      await Promise.allSettled(
        toSync.map((p) =>
          syncUserFromTeaseMe(p.id).catch((err) => {
            console.error(
              `[chatter.getMyGroups] TeaseMe sync failed for ${p.username}:`,
              err instanceof Error ? err.message : err
            );
            throw err;
          })
        )
      );

      // Re-fetch so the response reflects freshly-synced data.
      const refreshed = await prisma.chatterGroupMember.findMany({
        where: { chatterId: req.user.id },
        select: { group: { select: groupSelect } },
      });
      groups = refreshed.map((m) => m.group);
    }

    // Mint fresh presigned URLs on every request (never store them in DB).
    const hydrated = await Promise.all(
      groups.map(async (g) => {
        if (!g.promoter) return g;
        const { profilePhotoKey, profileVideoKey, ...rest } = g.promoter;
        const [photoUrl, videoUrl] = await Promise.all([
          getPresignedUrl(profilePhotoKey),
          getPresignedUrl(profileVideoKey),
        ]);
        return {
          ...g,
          promoter: {
            ...rest,
            photoUrl,
            videoUrl,
          },
        };
      })
    );

    res.json({ groups: hydrated });
  } catch (error) {
    console.error('Get my groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

// GET /api/chatters — list all chatters
export const listChatters = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const chatters = await prisma.user.findMany({
      where: { userType: UserType.CHATTER },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        chatterGroupMemberships: {
          select: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = chatters.map((c) => ({
      ...c,
      groups: c.chatterGroupMemberships.map((m) => m.group),
      chatterGroupMemberships: undefined,
    }));

    res.json({ chatters: mapped });
  } catch (error) {
    console.error('List chatters error:', error);
    res.status(500).json({ error: 'Failed to list chatters' });
  }
};

// GET /api/chatters/:id — get a single chatter
export const getChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const chatter = await prisma.user.findFirst({
      where: { id, userType: UserType.CHATTER },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        chatterGroupMemberships: {
          select: {
            group: {
              select: { id: true, name: true, commissionPercentage: true },
            },
          },
        },
        commissions: {
          where: { type: 'chatter' },
          select: { id: true, amount: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!chatter) {
      return res.status(404).json({ error: 'Chatter not found' });
    }

    res.json({
      chatter: {
        ...chatter,
        groups: chatter.chatterGroupMemberships.map((m) => m.group),
        chatterGroupMemberships: undefined,
      },
    });
  } catch (error) {
    console.error('Get chatter error:', error);
    res.status(500).json({ error: 'Failed to get chatter' });
  }
};

// DELETE /api/chatters/:id — delete a chatter
export const deleteChatter = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAccountManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const chatter = await prisma.user.findFirst({
      where: { id, userType: UserType.CHATTER },
    });

    if (!chatter) {
      return res.status(404).json({ error: 'Chatter not found' });
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: 'Chatter deleted successfully' });
  } catch (error) {
    console.error('Delete chatter error:', error);
    res.status(500).json({ error: 'Failed to delete chatter' });
  }
};
