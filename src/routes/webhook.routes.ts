import { Router } from "express";
import { receiveTeasemeStepWebhook } from "../controllers/referral.controller";

const router = Router();

/**
 * POST /api/webhooks/teaseme-step
 *
 * Receives step-change push notifications from the TeaseMe app.
 * Authentication is handled inside the controller via the
 * x-webhook-secret header — no JWT middleware here.
 */
router.post("/teaseme-step", receiveTeasemeStepWebhook);

export default router;
