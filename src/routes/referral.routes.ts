import { Router } from "express";
import { body } from "express-validator";
import * as referralController from "../controllers/referral.controller";
import { authenticate } from "../middleware/auth.middleware";
import { EMAIL_NORMALIZE_OPTIONS } from "../utils/email-normalize";

const router = Router();

// Create referral invite (Account Manager or Influencer)
router.post(
  "/create",
  authenticate,
  [
    body("campaignId").trim().notEmpty(),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      // Normalize the email before it reaches the controller using the
      // shared conservative options (no Gmail-dot stripping, no
      // subaddress removal). See `utils/email-normalize.ts` for the
      // rationale and the full set of disabled flags.
      .normalizeEmail(EMAIL_NORMALIZE_OPTIONS),
  ],
  referralController.createReferralInvite,
);

// Get referral by invite code (public endpoint for registration)
router.get("/invite/:inviteCode", referralController.getReferralByInviteCode);

// Get user's referrals
router.get("/my-referrals", authenticate, referralController.getMyReferrals);

// Check invite quota for a campaign (MUST be before /:id route)
router.get("/quota/:campaignId", authenticate, referralController.checkInviteQuota);

// Resend the invite email for a pending referral (owner or admin only).
// Extends expiry by another 24h and bumps metadata.resendCount.
router.post(
  "/:id/resend",
  authenticate,
  referralController.resendReferralInvite,
);

// Delete a pending referral invite (owner or admin only). Refuses to delete
// rows that already have a referredUser or downstream referrals.
router.delete(
  "/:id",
  authenticate,
  referralController.deleteReferralInvite,
);

// ─── Lifecycle action endpoints (My Promoters card buttons) ───────────────
// Deny a pending referral (soft-reject → status CANCELLED + upstream notify).
router.post(
  "/:id/deny",
  authenticate,
  referralController.denyReferralInvite,
);

// Reassign the referring account manager for a referral.
router.post(
  "/:id/reassign",
  authenticate,
  [body("newReferrerId").trim().notEmpty()],
  referralController.reassignReferralInvite,
);

// Request TeaseMe to start building the landing page for this invite.
router.post(
  "/:id/order-landing-page",
  authenticate,
  referralController.orderReferralLandingPage,
);

// Assign a chatter group to the (now registered) promoter attached to this
// referral and notify TeaseMe.
router.post(
  "/:id/assign-chatters",
  authenticate,
  [body("chatterGroupId").trim().notEmpty()],
  referralController.assignReferralChatters,
);

// Get referral details
router.get("/:id", authenticate, referralController.getReferralById);

// Track click on referral link
router.post("/track-click", referralController.trackClick);

// Generate tracking link
router.post(
  "/tracking-link",
  authenticate,
  [body("campaignId").trim().notEmpty()],
  referralController.generateTrackingLink,
);

// Get user's tracking links
router.get(
  "/tracking-links/me",
  authenticate,
  referralController.getMyTrackingLinks,
);

export default router;
