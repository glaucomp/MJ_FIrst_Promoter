import { Router } from "express";
import * as transactionController from "../controllers/transaction.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, transactionController.getAllTransactions);

export default router;
