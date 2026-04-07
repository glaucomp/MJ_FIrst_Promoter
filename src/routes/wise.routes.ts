import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import * as wiseController from "../controllers/wise.controller";

const router = Router();

// Admin: Wise account info + balances
router.get("/profile", authenticate, wiseController.getWiseProfile);

// Any authenticated user: save their Wise recipient account ID
router.put("/recipient", authenticate, wiseController.saveWiseRecipient);

// Any authenticated user: create their own Wise recipient via bank details
router.post("/me/recipient", authenticate, wiseController.createOwnRecipient);

// Admin: create a Wise recipient account for a promoter via Wise API
router.post("/recipients", authenticate, wiseController.createRecipientForUser);

// Admin: single-commission payout
router.post("/payout", authenticate, wiseController.initiateWisePayout);

// Admin: bulk payout
router.post("/payout/bulk", authenticate, wiseController.initiateBulkWisePayout);

// Admin: check/refresh payout status
router.get("/payout/:commissionId", authenticate, wiseController.getPayoutStatus);

// Sandbox: simulate transfer status transitions
router.post("/simulate/:transferId/:status", authenticate, wiseController.simulateTransfer);

export default router;
