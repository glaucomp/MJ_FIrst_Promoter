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
    body("email").optional().isEmail().normalizeEmail(),
  ],
  referralController.createReferralInvite,
);

// Get referral by invite code (public endpoint for registration)
router.get("/invite/:inviteCode", referralController.getReferralByInviteCode);

// Get user's referrals
router.get("/my-referrals", authenticate, referralController.getMyReferrals);

// Check invite quota for a campaign (MUST be before /:id route)
router.get("/quota/:campaignId", authenticate, referralController.checkInviteQuota);

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
