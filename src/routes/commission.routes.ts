import { Router } from "express";
import * as commissionController from "../controllers/commission.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, commissionController.getAllCommissions);
router.patch("/:id", authenticate, commissionController.updateCommissionStatus);

export default router;
