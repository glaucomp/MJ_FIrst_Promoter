import { Router } from "express";
import { body } from "express-validator";
import { UserRole } from "@prisma/client";
import * as referralController from "../controllers/referral.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  INVITE_USERNAME_ERROR,
  isValidInviteUsername,
  normalizeInviteUsername,
} from "../utils/invite-username";

const router = Router();

// Create referral invite (Account Manager or Influencer).
// The invite identifies the person by username. Their email is collected on
// the join form and verified later, when they become an influencer.
router.post(
  "/create",
  authenticate,
  [
    body("campaignId").trim().notEmpty(),
    body("username")
      .trim()
      .notEmpty()
      .withMessage("Username is required")
      .customSanitizer((value) =>
        normalizeInviteUsername(String(value ?? "")),
      )
      .custom((value) => {
        if (!isValidInviteUsername(String(value ?? ""))) {
          throw new Error(INVITE_USERNAME_ERROR);
        }
        return true;
      }),
  ],
  referralController.createReferralInvite,
);

// Get referral by invite code (public endpoint for registration)
router.get("/invite/:inviteCode", referralController.getReferralByInviteCode);

// Get user's referrals
router.get("/my-referrals", authenticate, referralController.getMyReferrals);

// Admin-only: all account managers with referral trees + commission %
router.get(
  "/admin-structure",
  authenticate,
  authorize(UserRole.ADMIN),
  referralController.getAdminNetworkStructure,
);

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

// Sugar Scratchie: shared default /join URL for the Forms step (no step advance).
router.post(
  "/:id/default-landing-page",
  authenticate,
  referralController.createReferralDefaultLandingPage,
);

// Sugar Scratchie: operator packs URL for Create with n8n (no step advance).
router.post(
  "/:id/package-workspace",
  authenticate,
  referralController.getReferralPackageWorkspace,
);

// Sugar Scratchie: complete Make package / n8n (onboarding step 2).
router.post(
  "/:id/make-package",
  authenticate,
  referralController.makeReferralPackage,
);

// Request TeaseMe / Sugar to start building the landing page for this invite.
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

// Ensure the influencer has a dedicated chatter group (create if missing).
// Returns the group so the UI can navigate directly to it.
router.post(
  "/:id/ensure-group",
  authenticate,
  referralController.ensureInfluencerGroup,
);

// Send (or resend) the promoter welcome email. Replaces the automatic
// 4→5 promotion hook with an explicit AM-driven action.
router.post(
  "/:id/send-welcome-email",
  authenticate,
  referralController.sendReferralWelcomeEmail,
);

// SSE stream: push TeaseMe step-progress updates to the browser in real time.
// Must be registered before the generic /:id GET to avoid route shadowing.
router.get(
  "/:id/status-stream",
  authenticate,
  referralController.streamReferralStatus,
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
