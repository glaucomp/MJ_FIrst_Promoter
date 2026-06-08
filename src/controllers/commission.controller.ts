import { PrismaClient, UserRole, UserType } from "@prisma/client";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { simulateCommissionForSeller } from "../services/commission-simulator.service";

const prisma = new PrismaClient();

export const getAllCommissions = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    // Payers share admin-level visibility on the Reports / Payouts screens.
    const isAdminLike =
      user.role === UserRole.ADMIN ||
      user.userType === UserType.ADMIN ||
      user.userType === UserType.PAYER;
    // Admins and payers see all commissions, but never commissions assigned to
    // admin accounts.
    const where = isAdminLike
      ? { user: { role: { not: UserRole.ADMIN }, userType: { not: UserType.ADMIN } } }
      : { userId: user.id };

    const commissions = await prisma.commission.findMany({
      where,
      // wiseTransferId and wiseStatus are returned by default (not excluded)
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
            wiseEmail: true,
            wiseRecipientId: true,
            wiseRecipientType: true,
          },
        },
        campaign: {
          select: {
            name: true,
            commissionRate: true,
            secondaryRate: true,
            recurringRate: true,
          },
        },
        referral: {
          include: {
            referrer: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            email: true,
            name: true,
            revenue: true,
          },
        },
        transaction: {
          select: {
            id: true,
            eventId: true,
            type: true,
            saleAmount: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ commissions });
  } catch (error) {
    console.error("Get all commissions error:", error);
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
};

export const updateCommissionStatus = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { status } = req.body;

    const canManagePayouts =
      user.role === UserRole.ADMIN ||
      user.userType === UserType.ADMIN ||
      user.userType === UserType.PAYER;
    if (!canManagePayouts) {
      return res
        .status(403)
        .json({ error: "Only admins or payers can update commission status" });
    }

    if (!["unpaid", "pending", "paid"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const commission = await prisma.commission.update({
      where: { id },
      data: {
        status,
        ...(status === "paid" && { paidAt: new Date() }),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        referral: {
          include: {
            campaign: {
              select: { name: true },
            },
          },
        },
      },
    });

    res.json({ commission });
  } catch (error) {
    console.error("Update commission status error:", error);
    res.status(500).json({ error: "Failed to update commission status" });
  }
};

/** Admin-only: preview commission splits for a hypothetical sale. */
export const simulateCommission = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { sellerUserId, saleAmount, campaignId, referralId } = req.body as {
      sellerUserId?: string;
      saleAmount?: number;
      campaignId?: string;
      referralId?: string;
    };

    if (!sellerUserId && !referralId) {
      return res
        .status(400)
        .json({ error: "sellerUserId or referralId is required" });
    }

    const amount = Number(saleAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "saleAmount must be a positive number" });
    }

    let resolvedSellerId = sellerUserId;
    if (!resolvedSellerId && referralId) {
      const row = await prisma.referral.findUnique({
        where: { id: referralId },
        select: { referredUserId: true, referrerId: true },
      });
      resolvedSellerId = row?.referredUserId ?? row?.referrerId ?? undefined;
    }

    if (!resolvedSellerId) {
      return res.status(400).json({ error: "Could not resolve seller for this referral" });
    }

    const simulation = await simulateCommissionForSeller({
      sellerUserId: resolvedSellerId,
      saleAmount: amount,
      campaignId,
      referralId,
    });

    res.json({ simulation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to simulate commission";
    if (message.includes("No active referral")) {
      return res.status(404).json({ error: message });
    }
    console.error("Simulate commission error:", error);
    res.status(500).json({ error: message });
  }
};
