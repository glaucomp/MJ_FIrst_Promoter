import { Response } from 'express';
import { PrismaClient, UserType, UserRole } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
// Help videos live in the public S3 bucket.
// TEASEME_S3_BUCKET_PUBLIC_URL accepts either a bare bucket name or full S3 URL.
const rawHelpBucket =
  process.env.TEASEME_S3_BUCKET_PUBLIC_URL?.trim() || 'bucket-image-tease-me';
const helpBucketUrlMatch =
  /^https?:\/\/([^.]+)\.s3\.[^.]+\.amazonaws\.com/i.exec(rawHelpBucket);
const helpBucket = helpBucketUrlMatch?.[1] ?? rawHelpBucket;
const HELP_VIDEO_BASE = helpBucketUrlMatch
  ? rawHelpBucket.replace(/\/+$/, '')
  : `https://${helpBucket}.s3.amazonaws.com`;

// Strips any accidental leading "/" or "bucket-name/" prefix stored in the DB.
const buildVideoUrl = (s3Key: string): string => {
  let clean = s3Key.replace(/^\/+/, '');
  const bucketPrefix = `${helpBucket}/`;
  if (clean.startsWith(bucketPrefix)) {
    clean = clean.slice(bucketPrefix.length);
  }
  return `${HELP_VIDEO_BASE}/${clean}`;
};

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

const isAdmin = (req: AuthRequest) =>
  req.user?.role === UserRole.ADMIN || req.user?.userType === UserType.ADMIN;

// ── User-facing: get videos for the logged-in user's type ─────────────────

export const getHelpVideos = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { userType } = req.user;

  if (
    userType !== UserType.ACCOUNT_MANAGER &&
    userType !== UserType.CHATTER &&
    !isAdmin(req)
  ) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Admins see active videos for all user types; AM and chatters see their own.
  const whereClause = isAdmin(req)
    ? { isActive: true }
    : { userType, isActive: true };

  const records = await prisma.helpVideo.findMany({
    where: whereClause,
    orderBy: [{ userType: 'asc' }, { sortOrder: 'asc' }],
  });

  const videos = records.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    url: buildVideoUrl(r.s3Key),
    userType: r.userType,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    s3Key: r.s3Key,
  }));

  // Filter out placeholder rows that haven't had a real key set yet.
  return res.json(videos.filter((v) => !v.s3Key.startsWith('PLACEHOLDER')));
};

// ── Admin: list all (including inactive) ─────────────────────────────────

export const adminListVideos = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const records = await prisma.helpVideo.findMany({
    orderBy: [{ userType: 'asc' }, { sortOrder: 'asc' }],
  });

  return res.json(records);
};

// ── Admin: create ─────────────────────────────────────────────────────────

export const adminCreateVideo = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { title, description, s3Key, userType, sortOrder } = req.body as {
    title?: string;
    description?: string;
    s3Key?: string;
    userType?: string;
    sortOrder?: number;
  };

  if (!title?.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!s3Key?.trim()) {
    return res.status(400).json({ error: 's3Key is required' });
  }
  if (userType !== 'ACCOUNT_MANAGER' && userType !== 'CHATTER') {
    return res.status(400).json({ error: 'userType must be ACCOUNT_MANAGER or CHATTER' });
  }

  const video = await prisma.helpVideo.create({
    data: {
      title: title.trim(),
      description: description?.trim() ?? null,
      s3Key: s3Key.trim(),
      userType: userType as UserType,
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      isActive: true,
    },
  });

  return res.status(201).json(video);
};

// ── Admin: update ─────────────────────────────────────────────────────────

export const adminUpdateVideo = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { id } = req.params;
  const { title, description, s3Key, userType, sortOrder, isActive } = req.body as {
    title?: string;
    description?: string;
    s3Key?: string;
    userType?: string;
    sortOrder?: number;
    isActive?: boolean;
  };

  if (userType !== undefined && userType !== 'ACCOUNT_MANAGER' && userType !== 'CHATTER') {
    return res.status(400).json({ error: 'userType must be ACCOUNT_MANAGER or CHATTER' });
  }
  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (s3Key !== undefined && !s3Key.trim()) {
    return res.status(400).json({ error: 's3Key is required' });
  }

  const existing = await prisma.helpVideo.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const video = await prisma.helpVideo.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description.trim() || null }),
      ...(s3Key !== undefined && { s3Key: s3Key.trim() }),
      ...(userType !== undefined && { userType: userType as UserType }),
      ...(typeof sortOrder === 'number' && { sortOrder }),
      ...(typeof isActive === 'boolean' && { isActive }),
    },
  });

  return res.json(video);
};

// ── Admin: delete ─────────────────────────────────────────────────────────

export const adminDeleteVideo = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { id } = req.params;

  const existing = await prisma.helpVideo.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Video not found' });
  }

  await prisma.helpVideo.delete({ where: { id } });

  return res.json({ message: 'Video deleted' });
};
