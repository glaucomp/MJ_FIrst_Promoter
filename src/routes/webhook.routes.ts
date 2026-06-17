import { Router } from "express";
import { receivePromoCodeRedeemedWebhook, verifyPromoCode } from "../controllers/gift.controller";
import { receiveTeasemeStepWebhook } from "../controllers/referral.controller";
import { receiveVipPreregisterWebhook } from "../controllers/vip-invite.controller";

const router = Router();

/**
 * POST /api/webhooks/teaseme-step
 *
 * Receives step-change push notifications from the TeaseMe app.
 * Authentication is handled inside the controller via the
 * x-webhook-secret header — no JWT middleware here.
 */
router.post("/teaseme-step", receiveTeasemeStepWebhook);

/**
 * POST /api/webhooks/teaseme/vip-preregister
 *
 * VIP preregister lifecycle updates from TeaseMe (profile / verify / login).
 */
router.post("/teaseme/vip-preregister", receiveVipPreregisterWebhook);

/**
 * POST /api/webhooks/teaseme/promo-code-redeemed
 *
 * First-deposit promo code redemption updates from TeaseMe.
 */
router.post("/teaseme/promo-code-redeemed", receivePromoCodeRedeemedWebhook);

/**
 * POST /api/webhooks/teaseme/verify-promo-code
 *
 * Called by TeaseMe to validate a promo code before granting diamonds.
 * Returns validity, diamond amount, and marks the code as used.
 */
router.post("/teaseme/verify-promo-code", verifyPromoCode);

export default router;
