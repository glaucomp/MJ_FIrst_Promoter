import { PrismaClient, UserRole, UserType } from "@prisma/client";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as wiseService from "../services/wise.service";
import type { RecipientInput } from "../services/wise.service";

const prisma = new PrismaClient();

const isAdmin = (user: NonNullable<AuthRequest["user"]>) =>
  user.role === UserRole.ADMIN || user.userType === UserType.ADMIN;

/** Commissions created within this many days are on refund hold and cannot be paid out. */
const REFUND_HOLD_DAYS = 7;

const isOnRefundHold = (createdAt: Date): boolean => {
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs < REFUND_HOLD_DAYS * 24 * 60 * 60 * 1000;
};

/** Map the stored Wise recipient type to its target payout currency. */
const targetCurrencyFor = (recipientType: string | null): string => {
  if (recipientType === "australian") return "AUD";
  if (recipientType === "iban") return "EUR";
  return "USD";
};

// ─── GET /api/wise/profile ────────────────────────────────────────────────────
/**
 * Admin: return Wise profile info + account balances.
 */
export const getWiseProfile = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user!)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  try {
    const profileId = await wiseService.getProfileId();
    const [profiles, balances] = await Promise.all([
      wiseService.getProfiles(),
      wiseService.getBalances(profileId),
    ]);
    const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
    res.json({ profile, profileId, balances });
  } catch (err: any) {
    console.error("getWiseProfile:", err.message);
    res.status(502).json({ error: err.message ?? "Wise API error" });
  }
};

// ─── PUT /api/wise/recipient ──────────────────────────────────────────────────
/**
 * Any authenticated user: save their own Wise recipient account ID.
 *
 * Body: { wiseRecipientId: string | null, wiseEmail?: string, wiseRecipientType?: string }
 *
 * The recipient ID is the numeric Wise account ID — either created by the admin
 * via POST /v1/accounts, or looked up from the promoter's Wise dashboard.
 */
export const saveWiseRecipient = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { wiseRecipientId, wiseEmail, wiseRecipientType } = req.body as {
    wiseRecipientId?: string | null;
    wiseEmail?: string | null;
    wiseRecipientType?: string | null;
  };

  if (wiseRecipientId !== undefined && wiseRecipientId !== null && wiseRecipientId !== "") {
    if (!/^\d+$/.test(String(wiseRecipientId))) {
      return res.status(400).json({ error: "wiseRecipientId must be a numeric Wise account ID" });
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        wiseRecipientId: wiseRecipientId ? String(wiseRecipientId) : null,
        wiseEmail: wiseEmail ?? null,
        wiseRecipientType: wiseRecipientType ?? null,
      },
      select: { id: true, email: true, wiseRecipientId: true, wiseEmail: true, wiseRecipientType: true },
    });
    res.json({ user, message: "Wise recipient saved" });
  } catch (err: any) {
    console.error("saveWiseRecipient:", err.message);
    res.status(500).json({ error: "Failed to save Wise recipient" });
  }
};

// ─── POST /api/wise/recipients ────────────────────────────────────────────────
/**
 * Admin: create a new Wise recipient account via the Wise API and store the
 * resulting ID on the promoter's user record.
 *
 * Body: { userId: string, recipient: RecipientInput }
 * where RecipientInput matches the Wise /v1/accounts request body.
 */
export const createRecipientForUser = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user!)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const { userId, recipient } = req.body as { userId: string; recipient: RecipientInput };
  if (!userId || !recipient) {
    return res.status(400).json({ error: "userId and recipient are required" });
  }
  try {
    const profileId = await wiseService.getProfileId();
    const wiseAccount = await wiseService.createRecipientAccount(profileId, recipient);

    await prisma.user.update({
      where: { id: userId },
      data: {
        wiseRecipientId: String(wiseAccount.id),
        wiseRecipientType: wiseAccount.type,
        ...(recipient.type === "email" ? { wiseEmail: (recipient as any).email } : {}),
      },
    });

    res.json({ wiseAccount, message: "Wise recipient created and linked" });
  } catch (err: any) {
    console.error("createRecipientForUser:", err.message);
    res.status(502).json({ error: err.message ?? "Failed to create Wise recipient" });
  }
};

// ─── POST /api/wise/me/recipient ─────────────────────────────────────────────
/**
 * Any authenticated user: create their own Wise recipient account via the Wise
 * API using the bank details they provide, then link the returned ID to their
 * own user record.
 *
 * Body: { recipient: RecipientInput }
 */
export const createOwnRecipient = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { recipient } = req.body as { recipient: RecipientInput };

  if (!recipient?.type) {
    return res.status(400).json({ error: "recipient with a type is required" });
  }

  try {
    const profileId = await wiseService.getProfileId();
    const wiseAccount = await wiseService.createRecipientAccount(profileId, recipient);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        wiseRecipientId: String(wiseAccount.id),
        wiseRecipientType: wiseAccount.type,
        ...(recipient.type === "email" ? { wiseEmail: (recipient as any).email } : {}),
      },
      select: { id: true, email: true, wiseRecipientId: true, wiseEmail: true, wiseRecipientType: true },
    });

    res.json({ wiseAccount, user: updated, message: "Wise recipient created and linked to your account" });
  } catch (err: any) {
    console.error("createOwnRecipient:", err.message);
    res.status(502).json({ error: err.message ?? "Failed to create Wise recipient" });
  }
};

// ─── POST /api/wise/payout ────────────────────────────────────────────────────
/**
 * Admin: initiate a Wise payout for a single commission.
 *
 * Exact flow (Postman collection):
 *   1. Resolve profile ID
 *   2. Create quote   → POST /v3/profiles/{id}/quotes
 *   3. Update quote   → PATCH /v3/profiles/{id}/quotes/{quoteId}  (merge-patch)
 *   4. Create transfer → POST /v1/transfers
 *   5. Fund transfer  → POST /v3/profiles/{id}/transfers/{id}/payments
 *   6. Get status     → GET  /v1/transfers/{id}
 *
 * Body: { commissionId, currency? }
 */
export const initiateWisePayout = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user!)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { commissionId } = req.body as {
    commissionId: string;
  };

  if (!commissionId) {
    return res.status(400).json({ error: "commissionId is required" });
  }

  try {
    const commission = await prisma.commission.findUnique({
      where: { id: commissionId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            wiseRecipientId: true,
            wiseEmail: true,
            wiseRecipientType: true,
          },
        },
      },
    });

    if (!commission) return res.status(404).json({ error: "Commission not found" });
    if (commission.status === "paid") return res.status(400).json({ error: "Commission is already paid" });
    if (!commission.user.wiseRecipientId) {
      return res.status(400).json({
        error: `Promoter ${commission.user.email} has no Wise recipient account configured`,
      });
    }
    if (commission.amount <= 0) {
      return res.status(400).json({ error: "Commission amount must be positive" });
    }
    if (isOnRefundHold(commission.createdAt)) {
      const releaseDate = new Date(commission.createdAt.getTime() + REFUND_HOLD_DAYS * 24 * 60 * 60 * 1000);
      return res.status(400).json({
        error: `Commission is within the ${REFUND_HOLD_DAYS}-day refund hold period. Earliest payout: ${releaseDate.toDateString()}`,
        holdUntil: releaseDate.toISOString(),
      });
    }

    const targetCurrency = targetCurrencyFor(commission.user.wiseRecipientType ?? null);
    const transfer = await wiseService.payExistingRecipient(
      Number(commission.user.wiseRecipientId),
      {
        amount: commission.amount,
        sourceCurrency: targetCurrency,
        targetCurrency,
        commissionId: commission.id,
        reference: "Commission",
      },
    );

    const updated = await prisma.commission.update({
      where: { id: commissionId },
      data: {
        // Set to "pending" for intermediate Wise states; the payout status
        // endpoint (GET /api/wise/payout/:commissionId) can promote to "paid"
        // once Wise confirms outgoing_payment_sent.
        status: transfer.status === "outgoing_payment_sent" ? "paid" : "pending",
        paidAt: transfer.status === "outgoing_payment_sent" ? new Date() : null,
        wiseTransferId: String(transfer.id),
        wiseStatus: transfer.status,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            wiseRecipientId: true,
          },
        },
      },
    });

    res.json({ commission: updated, transfer, message: "Wise payout initiated successfully" });
  } catch (err: any) {
    console.error("initiateWisePayout:", err.message);
    res.status(502).json({ error: err.message ?? "Failed to initiate Wise payout" });
  }
};

// ─── POST /api/wise/payout/bulk ───────────────────────────────────────────────
/**
 * Admin: initiate Wise payouts for multiple commissions.
 * Groups commissions by promoter and sends ONE consolidated transfer per promoter.
 * Body: { commissionIds: string[] }
 */
export const initiateBulkWisePayout = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user!)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { commissionIds } = req.body as { commissionIds: string[] };

  if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
    return res.status(400).json({ error: "commissionIds must be a non-empty array" });
  }

  // Fetch all requested commissions in one query
  const commissions = await prisma.commission.findMany({
    where: { id: { in: commissionIds } },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          wiseRecipientId: true,
          wiseRecipientType: true,
        },
      },
    },
  });

  const results: { commissionId: string; success: boolean; transferId?: number; error?: string }[] = [];

  // Detect commissionIds that do not exist in the database
  const foundIds = new Set(commissions.map((c) => c.id));
  for (const id of commissionIds) {
    if (!foundIds.has(id)) {
      results.push({ commissionId: id, success: false, error: "Commission not found" });
    }
  }

  // Validate each commission and bucket into per-promoter groups
  type CommissionRow = (typeof commissions)[number];
  const promoterMap = new Map<string, { eligible: CommissionRow[]; skipped: CommissionRow[] }>();

  for (const commission of commissions) {
    const bucket = promoterMap.get(commission.user.id) ?? { eligible: [], skipped: [] };
    promoterMap.set(commission.user.id, bucket);

    if (commission.status === "paid") {
      results.push({ commissionId: commission.id, success: false, error: "Already paid" });
      bucket.skipped.push(commission);
      continue;
    }
    if (!commission.user.wiseRecipientId) {
      results.push({ commissionId: commission.id, success: false, error: "No Wise recipient configured" });
      bucket.skipped.push(commission);
      continue;
    }
    if (commission.amount <= 0) {
      results.push({ commissionId: commission.id, success: false, error: "Amount must be positive" });
      bucket.skipped.push(commission);
      continue;
    }
    if (isOnRefundHold(commission.createdAt)) {
      const releaseDate = new Date(commission.createdAt.getTime() + REFUND_HOLD_DAYS * 24 * 60 * 60 * 1000);
      results.push({ commissionId: commission.id, success: false, error: `On refund hold until ${releaseDate.toDateString()}` });
      bucket.skipped.push(commission);
      continue;
    }

    bucket.eligible.push(commission);
  }

  // One consolidated Wise transfer per promoter
  for (const { eligible } of promoterMap.values()) {
    if (eligible.length === 0) continue;

    const sample = eligible[0];
    const recipientId = Number(sample.user.wiseRecipientId);
    const currency = targetCurrencyFor(sample.user.wiseRecipientType ?? null);
    const totalAmount = eligible.reduce((sum, c) => sum + c.amount, 0);

    try {
      const transfer = await wiseService.payExistingRecipient(
        recipientId,
        {
          amount: totalAmount,
          sourceCurrency: currency,
          targetCurrency: currency,
          commissionId: eligible.map((c) => c.id).sort().join(","),
          reference: "Commission",
        },
      );

      // Mark commissions as "pending" for in-flight Wise states; they will be
      // promoted to "paid" when the payout status endpoint confirms outgoing_payment_sent.
      const commissionStatus = transfer.status === "outgoing_payment_sent" ? "paid" : "pending";
      const paidAt = transfer.status === "outgoing_payment_sent" ? new Date() : null;
      await prisma.commission.updateMany({
        where: { id: { in: eligible.map((c) => c.id) } },
        data: { status: commissionStatus, paidAt, wiseTransferId: String(transfer.id), wiseStatus: transfer.status },
      });

      for (const c of eligible) {
        results.push({ commissionId: c.id, success: true, transferId: transfer.id });
      }
    } catch (err: any) {
      for (const c of eligible) {
        results.push({ commissionId: c.id, success: false, error: err.message });
      }
    }
  }

  res.json({
    results,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
};

// ─── GET /api/wise/payout/:commissionId ───────────────────────────────────────
/**
 * Admin: refresh the Wise transfer status for a commission.
 */
export const getPayoutStatus = async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user!)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const { commissionId } = req.params;
  try {
    const commission = await prisma.commission.findUnique({
      where: { id: commissionId },
      select: { id: true, wiseTransferId: true, wiseStatus: true, status: true },
    });
    if (!commission) return res.status(404).json({ error: "Commission not found" });
    if (!commission.wiseTransferId) return res.status(404).json({ error: "No Wise transfer linked" });

    const transfer = await wiseService.getTransfer(Number(commission.wiseTransferId));

    if (transfer.status !== commission.wiseStatus) {
      // Promote commission to "paid" when Wise confirms money has been sent.
      const nowPaid = transfer.status === "outgoing_payment_sent" && commission.status !== "paid";
      await prisma.commission.update({
        where: { id: commissionId },
        data: {
          wiseStatus: transfer.status,
          ...(nowPaid ? { status: "paid", paidAt: new Date() } : {}),
        },
      });
    }

    res.json({ transfer, commission: { ...commission, wiseStatus: transfer.status } });
  } catch (err: any) {
    console.error("getPayoutStatus:", err.message);
    res.status(502).json({ error: err.message ?? "Failed to get payout status" });
  }
};

// ─── POST /api/wise/simulate/:transferId/:status ──────────────────────────────
/**
 * Sandbox only: advance a transfer's status for testing.
 */
export const simulateTransfer = async (req: AuthRequest, res: Response) => {
  if (process.env.WISE_SANDBOX !== "true") {
    return res.status(403).json({ error: "Simulation only available in sandbox mode" });
  }
  if (!isAdmin(req.user!)) return res.status(403).json({ error: "Admin access required" });

  const { transferId, status } = req.params as {
    transferId: string;
    status: "processing" | "funds_converted" | "outgoing_payment_sent";
  };
  try {
    const transfer = await wiseService.simulateTransferStatus(Number(transferId), status);
    res.json({ transfer });
  } catch (err: any) {
    console.error("simulateTransfer:", err.message);
    res.status(502).json({ error: err.message });
  }
};
