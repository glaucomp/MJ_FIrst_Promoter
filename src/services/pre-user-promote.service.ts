import crypto from "node:crypto";

import { Prisma, PasswordResetPurpose, PrismaClient, UserRole, UserType } from "@prisma/client";
import bcrypt from "bcryptjs";

import { buildSetPasswordUrl } from "../utils/frontend-url";
import { createPasswordResetToken } from "./password-reset.service";
import { emailService } from "./email.service";


// ─── Username derivation ─────────────────────────────────────────────────────
//
// User.username has a unique constraint and is nullable. We try to seed it
// from the email local-part for a friendly login handle; if that collides
// with an existing user we append a 4-char suffix and retry a few times
// before giving up and storing null (login still works via email).

const sanitizeLocalPart = (raw: string): string => {
  // Lowercase, drop everything outside [a-z0-9._-], collapse repeats. Empty
  // result falls back to "user" so we always have a non-empty seed for the
  // collision retry loop below.
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || "user";
};

const ensureUniqueUsername = async (
  prisma: PrismaClient,
  emailLocal: string,
): Promise<string | null> => {
  const seed = sanitizeLocalPart(emailLocal);
  const candidates = [
    seed,
    ...Array.from({ length: 4 }, () =>
      `${seed}-${crypto.randomBytes(2).toString("hex")}`,
    ),
  ];
  for (const candidate of candidates) {
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return null;
};

// ─── Promote PreUser → User ──────────────────────────────────────────────────

export interface PromotePreUserInput {
  id: string;
  email: string;
  inviteCode: string | null;
  // FK to the originating Referral row. Used to inherit the referring
  // account manager so the newly-promoted User does not land in the
  // "Needs assignment" bucket on the Users page.
  referralId: string | null;
  // Stamped after the welcome email has been sent successfully. The
  // promotion helper short-circuits when this is non-null so the email
  // is delivered at most once per PreUser row, even if the underlying
  // User row is later deleted or `currentStep` is manually rewound.
  welcomeEmailSentAt: Date | null;
}

interface ResolvedOwnership {
  createdById: string | null;
  accountManagerId: string | null;
}

/**
 * Walk the originating referral to figure out which account manager should
 * own the new User.
 *
 * Rules (mirror the operator's expectation that "the AM who sent the
 * invite is the AM responsible for the resulting promoter"):
 *   - No referralId on the PreUser (legacy / orphaned row) -> both null.
 *     The user falls into "Needs assignment" until an admin drags them
 *     onto an AM, which is the same fallback that exists today for any
 *     unowned user.
 *   - Referrer is an Account Manager (or Admin) -> they own the row.
 *     `createdById` and `accountManagerId` both point at the referrer.
 *   - Referrer is a regular promoter -> use the referrer's own AM (if
 *     set) so the new user inherits the same AM as the person who
 *     invited them. `createdById` still records the literal referrer
 *     for provenance.
 */
const resolveOwnership = async (
  prisma: PrismaClient,
  referralId: string | null,
): Promise<ResolvedOwnership> => {
  if (!referralId) return { createdById: null, accountManagerId: null };
  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    select: {
      referrerId: true,
      referrer: {
        select: {
          id: true,
          userType: true,
          role: true,
          accountManagerId: true,
        },
      },
    },
  });
  if (!referral?.referrer) {
    return { createdById: null, accountManagerId: null };
  }
  const referrer = referral.referrer;
  const referrerOwnsDirectly =
    referrer.userType === UserType.ACCOUNT_MANAGER ||
    referrer.userType === UserType.ADMIN ||
    referrer.role === UserRole.ADMIN;
  return {
    createdById: referrer.id,
    accountManagerId: referrerOwnsDirectly
      ? referrer.id
      : referrer.accountManagerId,
  };
};

export interface PromotePreUserResult {
  status: "promoted" | "already_user" | "already_emailed" | "error";
  userId?: string;
  username?: string | null;
  emailSent?: boolean;
  error?: string;
}

/**
 * Promote a TeaseMe pre-influencer to a real `User` row in our DB and email
 * them a one-time set-password invite link. Triggered when upstream's
 * `survey_step` flips from 4 (approved) to 5 (published influencer) — at
 * that point the LP is live and the invitee needs login credentials so they
 * can manage their promoter dashboard on our side. The user is required to
 * set their password via the invite link (`mustChangePassword = true` until
 * they do so via the `/api/auth/password-reset` endpoint).
 *
 * Behavior:
 *   - Email-idempotent: if `preUser.welcomeEmailSentAt` is already set,
 *     returns `already_emailed` immediately without any mutation. This is
 *     the primary anti-double-email guarantee and survives even if the User
 *     row is later deleted or `currentStep` is manually rewound.
 *   - Retry-safe on user collision: if a User with this email already
 *     exists and `mustChangePassword` is still true (still in the invite
 *     flow), a fresh invite token is created and the set-password email is
 *     retried **without** rotating the stored password hash. If
 *     `mustChangePassword` is false (user has already set their own
 *     credentials or is an unrelated account), returns `already_user`
 *     without any mutation.
 *   - Stamps `PreUser.welcomeEmailSentAt` when the invite email is
 *     successfully delivered so subsequent polls can skip the promotion
 *     hook entirely.
 *   - Invite email is best-effort: a send failure is logged but does not
 *     fail the promotion (the User row is still created/updated). We
 *     surface `emailSent: false` so the caller can include it in logs for
 *     observability.
 *
 * Defaults match the existing /register handler: bcrypt(10), userType +
 * role both PROMOTER. firstName + username are seeded from the email
 * local-part (lastName left null) per the operator's decision.
 */
export const promotePreUserToUser = async (
  prisma: PrismaClient,
  preUser: PromotePreUserInput,
): Promise<PromotePreUserResult> => {
  // Durable "email already sent" record on the PreUser row. Survives even
  // if the resulting User row is later deleted manually, so the welcome
  // email truly fires at most once per PreUser. This is the strongest
  // anti-double-email guarantee — it would only be bypassed by an
  // explicit `welcomeEmailSentAt = null` rewrite in the DB.
  if (preUser.welcomeEmailSentAt) {
    console.info("[promote-pre-user] welcome email already sent; skipping", {
      preUserId: preUser.id,
      welcomeEmailSentAt: preUser.welcomeEmailSentAt.toISOString(),
    });
    return { status: "already_emailed" };
  }

  // Re-check the authoritative DB state inside the helper. The caller's
  // `preUser` snapshot can be stale under concurrency, so relying only on the
  // passed-in `welcomeEmailSentAt` can allow duplicate welcome emails when two
  // requests race on the same PreUser.
  const currentPreUser = await prisma.preUser.findUnique({
    where: { id: preUser.id },
    select: {
      id: true,
      welcomeEmailSentAt: true,
    },
  });

  if (currentPreUser?.welcomeEmailSentAt) {
    console.info("[promote-pre-user] welcome email already sent in db; skipping", {
      preUserId: preUser.id,
      welcomeEmailSentAt: currentPreUser.welcomeEmailSentAt.toISOString(),
    });
    return { status: "already_emailed" };
  }
  // Secondary idempotency: if a User with this email already exists but the
  // PreUser has not been stamped as emailed yet, treat this as a retry path
  // rather than a terminal skip. This covers partial-failure cases where the
  // user row was created in a prior attempt but the welcome email send (or
  // the later welcomeEmailSentAt stamp) failed.
  const existing = await prisma.user.findUnique({
    where: { email: preUser.email },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      inviteCode: true,
      mustChangePassword: true,
    },
  });

  // Guard: only overwrite the password/flag when the existing account is
  // provably still in the temp-password flow (mustChangePassword=true).
  // If the flag is false the user has already set their own credentials (or
  // this is a completely unrelated legitimate account that happens to share
  // the email). Touching that account would be an unauthenticated password
  // reset, so we return `already_user` without any mutation.
  if (existing && !existing.mustChangePassword) {
    console.info(
      "[promote-pre-user] user already exists with own credentials; skipping mutation",
      { preUserId: preUser.id, userId: existing.id, email: preUser.email },
    );
    return { status: "already_user", userId: existing.id };
  }

  let user;
  if (existing) {
    console.info("[promote-pre-user] user already exists; resending invite email", {
      preUserId: preUser.id,
      userId: existing.id,
      email: preUser.email,
    });
    // Don't rotate the password — the stored hash is already an unguessable
    // random value. A fresh invite token will be created below so the new
    // set-password link works even if the previous token expired or the
    // first email was never delivered.
    user = existing;
  } else {
    const emailLocal = preUser.email.split("@")[0] ?? "user";
    const username = await ensureUniqueUsername(prisma, emailLocal);
    // firstName is not subject to unique constraints, so we always set it
    // even if the username derivation gave up.
    const firstName = sanitizeLocalPart(emailLocal);
    const ownership = await resolveOwnership(prisma, preUser.referralId);

    // Generate a random, unguessable password hash. The user will set their
    // real password via the set-password invite link; this value is never
    // emailed. bcrypt cost-10 is kept in line with the rest of the codebase.
    const hashedPassword = await bcrypt.hash(
      crypto.randomBytes(32).toString("hex"),
      10,
    );

    try {
      user = await prisma.user.create({
        data: {
          email: preUser.email,
          password: hashedPassword,
          username,
          firstName,
          lastName: null,
          role: UserRole.PROMOTER,
          userType: UserType.PROMOTER,
          // Inherit ownership from the originating referral so the new row
          // shows up under the AM who sent the invite, not in "Needs
          // assignment". `createdById` is the immutable provenance pointer
          // (the literal person who triggered creation), `accountManagerId`
          // is the mutable AM-of-record (settable later via the assign-AM
          // endpoint). Both default to null when the referral chain can't
          // resolve a referrer (legacy / orphaned PreUser rows).
          createdById: ownership.createdById,
          accountManagerId: ownership.accountManagerId,
          // Hard-block the user out of the dashboard until they replace
          // the temp password we just emailed them. Login refuses to mint
          // a session cookie while this flag is true; the frontend routes
          // through /first-password-change which clears the flag and sets
          // the user's real password.
          mustChangePassword: true,
        },
        select: { id: true, email: true, username: true, firstName: true, inviteCode: true },
      });
    } catch (err) {
      // Most likely cause: a P2002 unique constraint race between our
      // findUnique check above and the create() — extremely unlikely in
      // this flow but worth handling gracefully so the poller doesn't
      // crash.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const target = Array.isArray(err.meta?.target)
          ? err.meta.target.map(String)
          : err.meta?.target
            ? [String(err.meta.target)]
            : [];
        const hasEmailTarget = target.includes("email");
        const hasUsernameTarget = target.includes("username");

        if (hasEmailTarget) {
          console.warn("[promote-pre-user] unique race on email; treating as already_user", {
            preUserId: preUser.id,
            target,
          });
          const racedUser = await prisma.user.findUnique({
            where: { email: preUser.email },
            select: { id: true },
          });
          return racedUser
            ? { status: "already_user", userId: racedUser.id }
            : { status: "error", error: "P2002 on email with no resolvable existing user" };
        }

        if (hasUsernameTarget) {
          console.warn("[promote-pre-user] username collision during create; retrying with null username", {
            preUserId: preUser.id,
            target,
          });
          try {
            user = await prisma.user.create({
              data: {
                email: preUser.email,
                password: hashedPassword,
                username: null,
                firstName,
                lastName: null,
                role: UserRole.PROMOTER,
                userType: UserType.PROMOTER,
                // Inherit ownership from the originating referral so the new row
                // shows up under the AM who sent the invite, not in "Needs
                // assignment". `createdById` is the immutable provenance pointer
                // (the literal person who triggered creation), `accountManagerId`
                // is the mutable AM-of-record (settable later via the assign-AM
                // endpoint). Both default to null when the referral chain can't
                // resolve a referrer (legacy / orphaned PreUser rows).
                createdById: ownership.createdById,
                accountManagerId: ownership.accountManagerId,
                // Hard-block the user out of the dashboard until they replace
                // the temp password we just emailed them. Login refuses to mint
                // a session cookie while this flag is true; the frontend routes
                // through /first-password-change which clears the flag and sets
                // the user's real password.
                mustChangePassword: true,
              },
              select: { id: true, email: true, username: true, firstName: true, inviteCode: true },
            });
          } catch (retryErr) {
            if (
              retryErr instanceof Prisma.PrismaClientKnownRequestError &&
              retryErr.code === "P2002"
            ) {
              const retryTarget = Array.isArray(retryErr.meta?.target)
                ? retryErr.meta.target.map(String)
                : retryErr.meta?.target
                  ? [String(retryErr.meta.target)]
                  : [];
              if (retryTarget.includes("email")) {
                console.warn("[promote-pre-user] email race after username retry; treating as already_user", {
                  preUserId: preUser.id,
                  target: retryTarget,
                });
                const racedUser = await prisma.user.findUnique({
                  where: { email: preUser.email },
                  select: { id: true },
                });
                return racedUser
                  ? { status: "already_user", userId: racedUser.id }
                  : { status: "error", error: "P2002 on email with no resolvable existing user" };
              }
            }
            console.error("[promote-pre-user] user.create retry with null username failed", {
              preUserId: preUser.id,
              err: retryErr instanceof Error ? retryErr.message : String(retryErr),
            });
            return {
              status: "error",
              error: retryErr instanceof Error ? retryErr.message : "user create retry failed",
            };
          }
        } else {
          console.warn("[promote-pre-user] unique constraint violation during create", {
            preUserId: preUser.id,
            target,
          });
          return {
            status: "error",
            error: `P2002 on unsupported target: ${target.join(",") || "unknown"}`,
          };
        }
      }
      console.error("[promote-pre-user] user.create failed", {
        preUserId: preUser.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return {
        status: "error",
        error: err instanceof Error ? err.message : "user create failed",
      };
    }
  }

  const emailSent = await sendInviteEmailSafe(prisma, {
    email: user.email,
    firstName: user.firstName,
    userId: user.id,
    preUserId: preUser.id,
  });

  if (emailSent) {
    console.info("[promote-pre-user] invite email sent", {
      preUserId: preUser.id,
      userId: user.id,
    });
    // Stamp PreUser.welcomeEmailSentAt so the poller's anti-double-email
    // guard and the stale-row filter both see the delivery confirmation.
    // updateMany + NULL guard is atomic: two concurrent promotions for the
    // same row will only stamp once (the second sees count=0 and is a no-op).
    try {
      await prisma.preUser.updateMany({
        where: { id: preUser.id, welcomeEmailSentAt: null },
        data: { welcomeEmailSentAt: new Date() },
      });
    } catch (err) {
      console.error("[promote-pre-user] welcomeEmailSentAt stamp failed", {
        preUserId: preUser.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    status: "promoted",
    userId: user.id,
    username: user.username ?? null,
    emailSent,
  };
};

interface InviteEmailContext {
  email: string;
  firstName: string | null;
  userId: string;
  preUserId: string;
}

/**
 * Best-effort invite-email dispatch. Creates a one-time set-password token
 * and sends a `sendSetPasswordEmail` so the new promoter can choose their
 * own password without a plaintext credential ever appearing in an email.
 * Logs the outcome but never throws — the User row is what matters for
 * login, and the operator can trigger a resend manually if needed.
 */
const sendInviteEmailSafe = async (
  prisma: PrismaClient,
  ctx: InviteEmailContext,
): Promise<boolean> => {
  let sent = false;
  try {
    const { rawToken, expiresAt } = await createPasswordResetToken(
      ctx.userId,
      PasswordResetPurpose.INVITE,
    );
    const setupUrl = buildSetPasswordUrl(rawToken);
    sent = await emailService.sendSetPasswordEmail({
      email: ctx.email,
      firstName: ctx.firstName,
      setupUrl,
      expiresAt,
    });
  } catch (err) {
    console.error("[promote-pre-user] invite email threw", {
      userId: ctx.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
  if (sent) {
    console.info("[promote-pre-user] promoted + invite emailed", {
      preUserId: ctx.preUserId,
      userId: ctx.userId,
      email: ctx.email,
    });
  } else {
    console.warn("[promote-pre-user] invite email not sent", {
      userId: ctx.userId,
      email: ctx.email,
    });
  }
  return sent;
};
