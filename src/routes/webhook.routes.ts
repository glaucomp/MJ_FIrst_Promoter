import { Router } from "express";
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

export default router;
