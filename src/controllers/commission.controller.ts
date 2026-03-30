import { PrismaClient, UserRole, UserType } from "@prisma/client";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";

const prisma = new PrismaClient();

export const getAllCommissions = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    const isAdmin = user.role === UserRole.ADMIN || user.userType === UserType.ADMIN;
    // Admins see all commissions, but never commissions assigned to admin accounts
    const where = isAdmin
      ? { user: { role: { not: UserRole.ADMIN }, userType: { not: UserType.ADMIN } } }
      : { userId: user.id };

    const commissions = await prisma.commission.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
          },
        },
        campaign: {
          select: {
            name: true,
            commissionRate: true,
            secondaryRate: true,
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

    const isAdmin = user.role === UserRole.ADMIN || user.userType === UserType.ADMIN;
    if (!isAdmin) {
      return res
        .status(403)
        .json({ error: "Only admins can update commission status" });
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
