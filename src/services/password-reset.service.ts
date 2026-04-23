import crypto from 'node:crypto';
import { PasswordResetPurpose, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default TTLs in hours. INVITE has a long window because new users may not
// notice the email immediately; RESET is short to limit exposure on
// self-service forgot-password requests.
const DEFAULT_INVITE_TTL_HOURS = 72;
const DEFAULT_RESET_TTL_HOURS = 1;

const hashToken = (rawToken: string) =>
  crypto.createHash('sha256').update(rawToken).digest('hex');

export interface CreatedToken {
  rawToken: string;
  expiresAt: Date;
}

/**
 * Generate a one-time token for the given user and purpose. Returns the raw
 * token — this is the ONLY place the caller will ever see it, and it must be
 * handed off to the email layer immediately. What we persist is the sha256
 * hash, so a DB leak never compromises active invites.
 */
export const createPasswordResetToken = async (
  userId: string,
  purpose: PasswordResetPurpose,
  ttlHoursOverride?: number,
): Promise<CreatedToken> => {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const ttlHours =
    ttlHoursOverride ??
    (purpose === PasswordResetPurpose.INVITE
      ? DEFAULT_INVITE_TTL_HOURS
      : DEFAULT_RESET_TTL_HOURS);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      purpose,
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
};

export interface ValidTokenInfo {
  userId: string;
  purpose: PasswordResetPurpose;
  email: string;
  firstName: string | null;
}

/**
 * Look up a raw token without consuming it, returning the underlying user
 * snapshot. Returns null for missing / expired / already-consumed tokens so
 * callers can render a generic "this link is no longer valid" state without
 * leaking which of those three reasons applied.
 */
export const validatePasswordResetToken = async (
  rawToken: string,
): Promise<ValidTokenInfo | null> => {
  if (!rawToken) return null;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: {
        select: { id: true, email: true, firstName: true },
      },
    },
  });

  if (!record) return null;
  if (record.consumedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  return {
    userId: record.user.id,
    purpose: record.purpose,
    email: record.user.email,
    firstName: record.user.firstName,
  };
};

/**
 * Atomically consume a token. Uses an `updateMany` with the full eligibility
 * predicate so concurrent requests cannot both succeed — the second one sees
 * `count === 0` and treats the token as invalid. Returns the userId on
 * success, null otherwise.
 */
export const consumePasswordResetToken = async (
  rawToken: string,
): Promise<{ userId: string; purpose: PasswordResetPurpose } | null> => {
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { userId: true, purpose: true, consumedAt: true, expiresAt: true },
  });
  if (!record) return null;
  if (record.consumedAt) return null;
  if (record.expiresAt.getTime() < now.getTime()) return null;

  const result = await prisma.passwordResetToken.updateMany({
    where: {
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });

  if (result.count === 0) return null;

  return { userId: record.userId, purpose: record.purpose };
};

/**
 * Invalidate every outstanding token for a user. Useful after a successful
 * password set so stale invite links from the same mailbox cannot be used
 * to take the account over again.
 */
export const invalidateUserTokens = async (userId: string) => {
  await prisma.passwordResetToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
};
