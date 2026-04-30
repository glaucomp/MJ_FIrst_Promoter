import crypto from "node:crypto";

import { Prisma, PrismaClient, UserRole, UserType } from "@prisma/client";
import bcrypt from "bcryptjs";

import { getFrontendUrl } from "../utils/frontend-url";
import { composeWelcomeHeaderDataUrl } from "./email-compose.service";
import { emailService } from "./email.service";
import {
  fetchTeasemePreUserStatus,
  syncUserFromTeaseMe,
} from "./teaseme.service";

// ─── Temporary password generation ───────────────────────────────────────────
//
// 12-char alphanumeric string used as the welcome email's plaintext
// password. Combined with `mustChangePassword: true`, this password is
// only valid for the very first login — `/api/auth/login` then routes
// the user through `/first-password-change` which rotates the hash and
// clears the flag. Excludes look-alike characters (0/O, 1/l/I) so the
// recipient can type the value off the email reliably.
const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 12;

const generateTemporaryPassword = (): string => {
  const bytes = crypto.randomBytes(TEMP_PASSWORD_LENGTH);
  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
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
  // Operator-initiated resend opt-in. When `true`, BOTH the input-side
  // check (`preUser.welcomeEmailSentAt`) and the DB-side race check are
  // bypassed so a resend always issues a fresh invite/set-password token
  // and re-sends the email. This does not rotate an existing stored
  // password hash. This is exactly what the "Resend Welcome Email"
  // button on the LP Live card needs: a deliberate, AM-driven action
  // that should always go through regardless of historical state.
  forceResend?: boolean;
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
export const resolveOwnership = async (
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
  // Anti-double-email guards. Both bypassed when `forceResend` is set so
  // the operator can drive a deliberate "Resend Welcome Email" action
  // from the LP Live card without us blocking it.
  if (!preUser.forceResend) {
    // Durable "email already sent" record on the PreUser row. Survives
    // even if the resulting User row is later deleted manually, so the
    // welcome email fires at most once per PreUser when nobody asks for
    // a resend.
    if (preUser.welcomeEmailSentAt) {
      console.info("[promote-pre-user] welcome email already sent; skipping", {
        preUserId: preUser.id,
        welcomeEmailSentAt: preUser.welcomeEmailSentAt.toISOString(),
      });
      return { status: "already_emailed" };
    }

    // Re-check the authoritative DB state. The caller's snapshot can be
    // stale under concurrency, so relying only on the passed-in
    // `welcomeEmailSentAt` can allow duplicate welcome emails when two
    // non-resend requests race on the same PreUser.
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
  // provably still in the temp-password flow (mustChangePassword=true) OR
  // when an operator explicitly requested a resend (forceResend=true). The
  // "Send/Resend Welcome Email" button on the LP Live card always sets
  // forceResend, so an AM clicking it deliberately rotates the user's
  // password back to a fresh temp value and re-emails the credentials —
  // this is the documented, advertised behaviour for that button. The
  // automatic poller (which never sets forceResend) is still blocked when
  // the user has chosen their own password, so we don't accidentally
  // overwrite credentials behind anyone's back.
  if (existing && !existing.mustChangePassword && !preUser.forceResend) {
    console.info(
      "[promote-pre-user] user already exists with own credentials; skipping mutation",
      { preUserId: preUser.id, userId: existing.id, email: preUser.email },
    );
    return { status: "already_user", userId: existing.id };
  }

  // Generate a fresh temporary password for every promotion attempt. For
  // brand-new users it's stored as their initial password. For existing
  // users in the resend path, it replaces the previous bcrypt hash so the
  // emailed plaintext is the only currently-valid credential. In both
  // cases `mustChangePassword: true` is enforced so the temp password is
  // only good for one login (then /first-password-change rotates it).
  const tempPassword = generateTemporaryPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  let user;
  if (existing) {
    console.info("[promote-pre-user] user already exists; rotating temp password and resending welcome", {
      preUserId: preUser.id,
      userId: existing.id,
      email: preUser.email,
    });
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hashedPassword,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        inviteCode: true,
        profilePhotoKey: true,
      },
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
        select: { id: true, email: true, username: true, firstName: true, inviteCode: true, profilePhotoKey: true },
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
              select: { id: true, email: true, username: true, firstName: true, inviteCode: true, profilePhotoKey: true },
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

  // Accept the originating Referral so the user appears under exactly ONE
  // card on My Promoters going forward.
  //
  // Without this, the parent Referral stays PENDING with the PreUser still
  // attached → it keeps rendering as an LP-Live "invite" card, while the
  // newly-promoted User looks orphaned (no ACTIVE referral linking them
  // as `referredUser`). Drag-dropping the orphan onto an AM then creates
  // a *second* ACTIVE Referral (manual-am-assign), and we end up with two
  // cards for the same person.
  //
  // Mirrors the acceptance step in the /register handler — same fields,
  // same idempotency. We deliberately do NOT delete the PreUser here:
  // welcomeEmailSentAt lives on it and drives the Send/Resend button label
  // on the LP Live card. The chip itself flips to LP Live via Referral
  // status (deriveChipState prioritises status === ACTIVE), so keeping the
  // PreUser around doesn't double-render the card.
  //
  // updateMany + status guard makes this idempotent and safe under retries:
  // - PENDING row → flipped to ACTIVE on first call, no-op on resend.
  // - ACTIVE row → no-op (count=0, status filter excludes it).
  // - CANCELLED row → intentionally NOT auto-resurrected; an admin
  //   explicitly denied the invite so we don't undo that.
  if (preUser.referralId) {
    try {
      const accepted = await prisma.referral.updateMany({
        where: { id: preUser.referralId, status: "PENDING" },
        data: {
          referredUserId: user.id,
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
      });
      if (accepted.count > 0) {
        console.info("[promote-pre-user] parent referral accepted", {
          preUserId: preUser.id,
          referralId: preUser.referralId,
          userId: user.id,
        });
      }
    } catch (err) {
      // Non-fatal: the user row exists and can log in. Worst case the
      // operator sees the duplicate-card UI for a moment until an admin
      // re-runs or cancels the stale row manually. We log so this
      // doesn't fail silently.
      console.error("[promote-pre-user] failed to accept parent referral", {
        preUserId: preUser.id,
        referralId: preUser.referralId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Mirror the upstream TeaseMe influencer profile onto our User row so
  // `profilePhotoKey` (and voiceId / social links) is populated before we
  // build the welcome-email banner. New promotions never have a photo key
  // locally — TeaseMe stores it on the published influencer — so without
  // this step the compositor below always short-circuits to null and the
  // email falls back to the plain heart banner. Wrapped in try/catch so
  // a 404 / network blip from upstream is non-fatal: the welcome email
  // still goes out, just with the static banner instead of the composed
  // one.
  //
  // Upstream's /influencer/<key> endpoint is keyed on the public TeaseMe
  // handle, NOT the local username we derive from the email local-part —
  // so passing `User.username` straight through 404s every time. Resolve
  // the upstream username via /step-progress first (same call the My
  // Promoters poller uses) and pass it as an explicit override; fall
  // back to `User.username` only when step-progress doesn't yield one.
  let photoKeyForCompose: string | null = user.profilePhotoKey ?? null;

  // Resolve every plausible TeaseMe lookup key we know about. The
  // /influencer/<key> endpoint accepts both the public username and the
  // upstream pre_influencer_id, and we don't have a guaranteed-correct
  // single source — so we try each in order and use the first one that
  // works. Order matters: upstream username (most stable, returned by
  // /step-progress when the LP is live) → upstream pre_influencer_id
  // (always set once approved) → invite code → our local username (last
  // resort, derived from email local-part and rarely matches upstream).
  const candidateKeys: { source: string; key: string }[] = [];
  let stepStatus: Awaited<ReturnType<typeof fetchTeasemePreUserStatus>> = null;
  try {
    stepStatus = await fetchTeasemePreUserStatus({
      email: preUser.email,
      inviteCode: preUser.inviteCode ?? undefined,
    });
  } catch (err) {
    console.warn("[promote-pre-user] teaseme step-progress lookup threw", {
      userId: user.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  console.info("[promote-pre-user] teaseme step-progress resolved", {
    userId: user.id,
    email: preUser.email,
    inviteCode: preUser.inviteCode ?? null,
    statusReturned: stepStatus !== null,
    upstreamUsername: stepStatus?.username ?? null,
    upstreamUserId: stepStatus?.teasemeUserId ?? null,
    upstreamStep: stepStatus?.step ?? null,
  });
  if (stepStatus?.username) {
    candidateKeys.push({ source: "step-progress.username", key: stepStatus.username });
  }
  if (stepStatus?.teasemeUserId) {
    candidateKeys.push({ source: "step-progress.teasemeUserId", key: stepStatus.teasemeUserId });
  }
  // Fall back to the PreUser's persisted teasemeUserId (the poller writes
  // it on every /step-progress refresh, so it can be present even when
  // the live call above timed out / returned null).
  try {
    const persisted = await prisma.preUser.findUnique({
      where: { id: preUser.id },
      select: { teasemeUserId: true },
    });
    if (
      persisted?.teasemeUserId &&
      !candidateKeys.some((c) => c.key === persisted.teasemeUserId)
    ) {
      candidateKeys.push({
        source: "preUser.teasemeUserId",
        key: persisted.teasemeUserId,
      });
    }
  } catch (err) {
    console.warn("[promote-pre-user] failed to read persisted teasemeUserId", {
      preUserId: preUser.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  if (preUser.inviteCode) {
    candidateKeys.push({ source: "preUser.inviteCode", key: preUser.inviteCode });
  }
  if (user.username && !candidateKeys.some((c) => c.key === user.username)) {
    candidateKeys.push({ source: "user.username", key: user.username });
  }

  let syncOk = false;
  for (const candidate of candidateKeys) {
    try {
      const synced = await syncUserFromTeaseMe(user.id, candidate.key);
      photoKeyForCompose = synced.profilePhotoKey;
      console.info("[promote-pre-user] teaseme sync ok before welcome email", {
        userId: user.id,
        lookupKey: candidate.key,
        lookupSource: candidate.source,
        profilePhotoKey: synced.profilePhotoKey,
      });
      syncOk = true;
      break;
    } catch (err) {
      console.warn("[promote-pre-user] teaseme sync attempt failed; trying next key", {
        userId: user.id,
        lookupKey: candidate.key,
        lookupSource: candidate.source,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (!syncOk) {
    console.warn(
      "[promote-pre-user] teaseme sync failed for every candidate key; using existing photoKey if any",
      {
        userId: user.id,
        triedKeys: candidateKeys.map((c) => `${c.source}=${c.key}`),
        existingPhotoKey: user.profilePhotoKey,
      },
    );
  }

  // Build the per-promoter banner composite (heart background + circular
  // profile photo + pink ring) and inline it as a data URL so the email
  // template can use it as the <img src> directly — no S3 upload, no
  // presigned URL, no expiry. Mirrors the upstream Python
  // `compose_email_header_image_url` semantics. Returns null if the
  // user has no profilePhotoKey yet, the photo or background download
  // fails, or sharp throws — in any of those cases the email just falls
  // back to the static verify-header banner, which is a graceful
  // degradation rather than a user-visible failure.
  const headerImageOverrideUrl = await composeWelcomeHeaderDataUrl({
    photoKey: photoKeyForCompose ?? "",
    identifier: user.id,
  });

  const emailSent = await sendWelcomeEmailSafe({
    email: user.email,
    username:
      user.username ?? sanitizeLocalPart(user.email.split("@")[0] ?? "user"),
    firstName: user.firstName,
    refId: user.inviteCode ?? "",
    tempPassword,
    headerImageOverrideUrl,
    userId: user.id,
    preUserId: preUser.id,
  });

  if (emailSent) {
    console.info("[promote-pre-user] welcome email sent", {
      preUserId: preUser.id,
      userId: user.id,
    });
    // Stamp PreUser.welcomeEmailSentAt so the poller's anti-double-email
    // guard sees the delivery confirmation. For operator-driven resends
    // (forceResend=true) we always update so the timestamp reflects the
    // most recent send; for the automatic path we keep the original
    // first-send semantics via the NULL guard.
    try {
      if (preUser.forceResend) {
        await prisma.preUser.update({
          where: { id: preUser.id },
          data: { welcomeEmailSentAt: new Date() },
        });
      } else {
        await prisma.preUser.updateMany({
          where: { id: preUser.id, welcomeEmailSentAt: null },
          data: { welcomeEmailSentAt: new Date() },
        });
      }
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
  firstName: string | null;
  refId: string;
  tempPassword: string;
  // Optional override for the welcome-email banner — typically a
  // `data:image/png;base64,…` URL produced by
  // `composeWelcomeHeaderDataUrl` containing the promoter's profile
  // photo composited onto the heart background. Null falls back to the
  // static verify-header banner.
  headerImageOverrideUrl: string | null;
  userId: string;
  preUserId: string;
}

/**
 * Best-effort welcome-email dispatch. Sends `sendPromoterWelcomeEmail` with
 * the username + plaintext temporary password + login URL so the new
 * promoter can sign in and is then routed through `/first-password-change`
 * to pick their real password. Logs the outcome but never throws — the
 * User row is what matters for login, and the operator can resend the
 * email manually if delivery failed.
 */
const sendWelcomeEmailSafe = async (
  ctx: WelcomeEmailContext,
): Promise<boolean> => {
  let sent = false;
  try {
    const loginUrl = `${getFrontendUrl()}/login`;
    sent = await emailService.sendPromoterWelcomeEmail({
      email: ctx.email,
      username: ctx.username,
      password: ctx.tempPassword,
      firstName: ctx.firstName ?? undefined,
      ref_id: ctx.refId,
      loginUrl,
      headerImageOverrideUrl: ctx.headerImageOverrideUrl,
    });
  } catch (err) {
    console.error("[promote-pre-user] welcome email threw", {
      userId: ctx.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
  if (sent) {
    console.info("[promote-pre-user] promoted + welcome emailed", {
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
