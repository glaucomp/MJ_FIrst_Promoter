import { Router } from "express";
import { UserRole } from "@prisma/client";
import * as commissionController from "../controllers/commission.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/simulate",
  authenticate,
  authorize(UserRole.ADMIN),
  commissionController.simulateCommission,
);

router.get("/", authenticate, commissionController.getAllCommissions);
router.patch("/:id", authenticate, commissionController.updateCommissionStatus);

export default router;
