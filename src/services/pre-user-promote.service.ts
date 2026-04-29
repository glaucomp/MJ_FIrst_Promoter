import crypto from "node:crypto";

import { Prisma, PrismaClient, UserRole, UserType } from "@prisma/client";
import bcrypt from "bcryptjs";

import { getFrontendUrl } from "../utils/frontend-url";
import { emailService } from "./email.service";

// ─── Temporary password ──────────────────────────────────────────────────────
//
// URL-safe base64url characters (letters, digits, "-" and "_"), 12 chars ≈
// 72 bits of entropy. Larger symbol sets can cause friction when the user
// copy/pastes from email (especially on mobile), and the welcome email
// already strongly nudges the user to change the password on first login.
const TEMP_PASSWORD_LENGTH = 12;

const generateTemporaryPassword = (): string => {
  // randomBytes -> base64url -> trim. 9 bytes encodes to 12 url-safe chars
  // without padding, which is exactly what we want.
  return crypto.randomBytes(9).toString("base64url").slice(0, TEMP_PASSWORD_LENGTH);
};

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
 * them a set-password link. Triggered when upstream's `survey_step` flips
 * from 4 (approved) to 5 (published influencer) — at that point the LP is
 * live and the invitee needs login credentials so they can manage their
 * promoter dashboard on our side.
 *
 * Behavior:
 *   - Email-idempotent: if `preUser.welcomeEmailSentAt` is already set,
 *     returns `already_emailed` immediately without any mutation. This is
 *     the primary anti-double-email guarantee and survives even if the User
 *     row is later deleted or `currentStep` is manually rewound.
 *   - Retry-safe on user collision: if a User with this email already
 *     exists but `mustChangePassword` is still true (provably in the
 *     temp-password flow), the password is refreshed and the welcome email
 *     is retried. If `mustChangePassword` is false (user has already set
 *     their own credentials or is an unrelated account), returns
 *     `already_user` without any mutation.
 *   - Stamps `PreUser.welcomeEmailSentAt` when the welcome email is
 *     successfully delivered so subsequent polls can skip the promotion
 *     hook entirely.
 *   - Welcome email is best-effort: a send failure is logged but does not
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

  const tempPassword = generateTemporaryPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  let user;
  if (existing) {
    console.info("[promote-pre-user] user already exists; retrying welcome email flow", {
      preUserId: preUser.id,
      userId: existing.id,
      email: preUser.email,
    });

    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hashedPassword,
        // Ensure the user remains blocked until they replace the freshly
        // generated temporary password included in the retried welcome email.
        mustChangePassword: true,
      },
      select: { id: true, email: true, username: true, firstName: true, inviteCode: true },
    });
  } else {
    const emailLocal = preUser.email.split("@")[0] ?? "user";
    const username = await ensureUniqueUsername(prisma, emailLocal);
    // firstName is not subject to unique constraints, so we always set it
    // even if the username derivation gave up.
    const firstName = sanitizeLocalPart(emailLocal);
    const ownership = await resolveOwnership(prisma, preUser.referralId);

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
        console.warn("[promote-pre-user] unique race; treating as already_user", {
          preUserId: preUser.id,
          target: err.meta?.target,
        });
        const racedUser = await prisma.user.findUnique({
          where: { email: preUser.email },
          select: { id: true },
        });
        return racedUser
          ? { status: "already_user", userId: racedUser.id }
          : { status: "error", error: "P2002 with no resolvable existing user" };
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

  const emailSent = await sendWelcomeEmailSafe({
    email: user.email,
    // Welcome template requires a non-empty username string. Fall back to
    // a sanitized email local-part if the unique-username derivation gave
    // up (or if we updated an existing User row whose username was null).
    username:
      user.username ?? sanitizeLocalPart(user.email.split("@")[0] ?? "user"),
    password: tempPassword,
    firstName: user.firstName,
    // ref_id slot in the template is the FirstPromoter-style invite code.
    // We don't auto-generate one for newly-promoted users, so use the
    // originating Referral's invite code if available.
    refId: preUser.inviteCode ?? "—",
    userId: user.id,
    preUserId: preUser.id,
  });

  if (emailSent) {
    console.info("[promote-pre-user] welcome email sent", {
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

interface WelcomeEmailContext {
  email: string;
  username: string;
  password: string;
  firstName: string | null;
  refId: string;
  userId: string;
  preUserId: string;
}

/**
 * Best-effort welcome-email dispatch. Logs the outcome but never throws —
 * the User row is what matters for login, and the operator can trigger a
 * resend manually if the bounce is real.
 */
const sendWelcomeEmailSafe = async (
  ctx: WelcomeEmailContext,
): Promise<boolean> => {
  const loginUrl = `${getFrontendUrl()}/login`;
  let sent = false;
  try {
    sent = await emailService.sendPromoterWelcomeEmail({
      email: ctx.email,
      username: ctx.username,
      password: ctx.password,
      firstName: ctx.firstName ?? undefined,
      ref_id: ctx.refId,
      loginUrl,
    });
  } catch (err) {
    console.error("[promote-pre-user] welcome email threw", {
      userId: ctx.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
  if (sent) {
    console.info("[promote-pre-user] promoted + emailed", {
      preUserId: ctx.preUserId,
      userId: ctx.userId,
      email: ctx.email,
    });
  } else {
    console.warn("[promote-pre-user] welcome email not sent", {
      userId: ctx.userId,
      email: ctx.email,
    });
  }
  return sent;
};
