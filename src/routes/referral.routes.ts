import { Router } from "express";
import { body } from "express-validator";
import * as referralController from "../controllers/referral.controller";
import { authenticate } from "../middleware/auth.middleware";

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
      // Preserve the email as the user entered it. The default
      // normalizeEmail() strips dots + subaddresses from Gmail addresses
      // ("dev.mjpro@gmail.com" -> "devmjpro@gmail.com"), which is correct
      // for Gmail-routing but wrong for display + equality checks here.
      // We only lowercase the domain/local part for consistent duplicate
      // detection.
      .normalizeEmail({
        gmail_remove_dots: false,
        gmail_remove_subaddress: false,
        gmail_convert_googlemaildotcom: false,
        outlookdotcom_remove_subaddress: false,
        yahoo_remove_subaddress: false,
        icloud_remove_subaddress: false,
      }),
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
