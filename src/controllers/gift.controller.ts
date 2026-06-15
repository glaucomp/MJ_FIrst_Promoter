import { timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

export type PromoCodeRedeemedWebhookPayload = {
  promo_code?: string;
  redeemed_at?: string;
};

const normalizePromoCode = (code: string): string => code.trim().toUpperCase();

const parseRedeemedAt = (value: string): Date | null => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const verifyTeasemeWebhookSecret = (req: Request): boolean => {
  const expectedSecret = process.env.TEASEME_WEBHOOK_SECRET;
  const rawHeader = req.headers["x-webhook-secret"];
  const receivedSecret = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  return (
    !!expectedSecret &&
    !!receivedSecret &&
    expectedSecret.length === receivedSecret.length &&
    timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(receivedSecret))
  );
};

/**
 * POST /api/webhooks/teaseme/verify-promo-code
 *
 * Called by TeaseMe when a user enters a promo code.
 * Validates the code, checks it belongs to the user's email,
 * and marks it as ACCEPTED in one atomic step.
 *
 * Auth via x-webhook-secret (TEASEME_WEBHOOK_SECRET).
 *
 * Request body: { promo_code: string, email: string }
 * Response:
 *   valid=true  → { ok: true, valid: true, diamonds: number, payer_email: string }
 *   valid=false → { ok: true, valid: false, reason: string }
 */
export const verifyPromoCode = async (req: Request, res: Response) => {
  if (!verifyTeasemeWebhookSecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { promo_code, email } = req.body as { promo_code?: string; email?: string };

  if (!promo_code || typeof promo_code !== "string") {
    return res.status(400).json({ error: "promo_code is required" });
  }

  const promoCode = normalizePromoCode(promo_code);

  try {
    const gift = await prisma.firstDepositGift.findUnique({
      where: { promoCode },
    });

    if (!gift) {
      return res.json({ ok: true, valid: false, reason: "code_not_found" });
    }

    // Code must be in SENT status (not yet redeemed)
    if (gift.status === "ACCEPTED") {
      return res.json({ ok: true, valid: false, reason: "already_redeemed" });
    }

    if (gift.status === "EXPIRED") {
      return res.json({ ok: true, valid: false, reason: "expired" });
    }

    if (gift.status !== "SENT") {
      return res.json({ ok: true, valid: false, reason: "not_available" });
    }

    // Check expiry
    if (gift.expiresAt && gift.expiresAt < new Date()) {
      await prisma.firstDepositGift.update({
        where: { promoCode },
        data: { status: "EXPIRED" },
      });
      return res.json({ ok: true, valid: false, reason: "expired" });
    }

    // If email provided, verify it matches the intended recipient
    if (email && gift.payerEmail) {
      const normalizedEmail = email.trim().toLowerCase();
      const expectedEmail = gift.payerEmail.trim().toLowerCase();
      if (normalizedEmail !== expectedEmail) {
        return res.json({ ok: true, valid: false, reason: "email_mismatch" });
      }
    }

    // All checks passed — mark as ACCEPTED
    await prisma.firstDepositGift.update({
      where: { promoCode },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    return res.json({
      ok: true,
      valid: true,
      diamonds: 120,
      payer_email: gift.payerEmail,
      payer_name: gift.payerName,
    });
  } catch (error) {
    console.error("[verify-promo-code] handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/webhooks/teaseme/promo-code-redeemed
 *
 * Called by TeaseMe when a first-deposit promo code is redeemed.
 * Auth via x-webhook-secret (TEASEME_WEBHOOK_SECRET).
 */
export const receivePromoCodeRedeemedWebhook = async (
  req: Request,
  res: Response,
) => {
  if (!verifyTeasemeWebhookSecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { promo_code, redeemed_at } = req.body as PromoCodeRedeemedWebhookPayload;

  if (!promo_code || typeof promo_code !== "string") {
    return res.status(400).json({ error: "promo_code is required" });
  }
  if (!redeemed_at || typeof redeemed_at !== "string") {
    return res.status(400).json({ error: "redeemed_at is required" });
  }

  const acceptedAt = parseRedeemedAt(redeemed_at);
  if (!acceptedAt) {
    return res.status(400).json({ error: "redeemed_at must be a valid ISO timestamp" });
  }

  const promoCode = normalizePromoCode(promo_code);

  try {
    const gift = await prisma.firstDepositGift.findUnique({
      where: { promoCode },
    });

    if (!gift) {
      console.warn("[promo-code-redeemed-webhook] no FirstDepositGift found", { promoCode });
      return res.status(200).json({ ok: true, matched: false });
    }

    if (gift.status === "ACCEPTED") {
      return res.status(200).json({ ok: true, matched: true, duplicate: true });
    }

    await prisma.firstDepositGift.update({
      where: { promoCode },
      data: { status: "ACCEPTED", acceptedAt },
    });

    return res.status(200).json({ ok: true, matched: true });
  } catch (error) {
    console.error("[promo-code-redeemed-webhook] handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
