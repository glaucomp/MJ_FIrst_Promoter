import { PrismaClient, UserRole } from "@prisma/client";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";

const prisma = new PrismaClient();

export const getAllCommissions = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    const where = user.role === UserRole.ADMIN ? {} : { userId: user.id };

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
        referral: {
          include: {
            campaign: {
              select: { 
                name: true,
                commissionRate: true,
                secondaryRate: true,
              },
            },
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
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter out tier 2 commissions for TEAM_MANAGER users
    const filteredCommissions = commissions.filter(commission => {
      // Get the full user details to check userType
      if (commission.user.id === user.id) {
        const userDetails = commission.user as any;
        // If user is TEAM_MANAGER, only show tier 1 (direct) commissions
        if (userDetails.userType === 'TEAM_MANAGER') {
          // Tier 1 commissions have percentage equal to campaign.commissionRate (30%)
          // Tier 2 commissions have percentage equal to campaign.secondaryRate (10%)
          const campaignRate = commission.referral?.campaign?.commissionRate;
          return commission.percentage === campaignRate;
        }
      }
      return true; // Show all commissions for ADMIN and other users
    });

    res.json({ commissions: filteredCommissions });
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

    if (user.role !== UserRole.ADMIN) {
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
