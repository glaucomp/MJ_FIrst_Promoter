import { PrismaClient, UserRole, UserType } from "@prisma/client";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";

const prisma = new PrismaClient();

const getPeriodDate = (period: string): Date | null => {
  const now = new Date();
  switch (period) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3month":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
};

export const getAllTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const period = (req.query.period as string) ?? "all";
    const page = (req.query.page as string) ?? "1";
    const limit = (req.query.limit as string) ?? "10";
    const search = (req.query.search as string | undefined)?.trim();
    const startDate = req.query.startDate as string | undefined;
    const endDate   = req.query.endDate   as string | undefined;

    const isAdmin =
      user.role === UserRole.ADMIN || user.userType === UserType.ADMIN;
    const pageNum = Math.max(1, Number.parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (startDate || endDate) {
      const parsedStart = startDate ? new Date(startDate) : null;
      const parsedEnd   = endDate   ? new Date(endDate)   : null;

      if (parsedStart && isNaN(parsedStart.valueOf())) {
        return res.status(400).json({ error: "Invalid startDate" });
      }
      if (parsedEnd && isNaN(parsedEnd.valueOf())) {
        return res.status(400).json({ error: "Invalid endDate" });
      }
      if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
        return res.status(400).json({ error: "startDate must not be after endDate" });
      }

      where.createdAt = {};
      if (parsedStart) where.createdAt.gte = parsedStart;
      if (parsedEnd)   where.createdAt.lte = parsedEnd;
    } else {
      const periodDate = getPeriodDate(period);
      if (periodDate) where.createdAt = { gte: periodDate };
    }

    if (search) {
      where.OR = [
        { eventId: { contains: search, mode: "insensitive" } },
        { customer: { is: { email: { contains: search, mode: "insensitive" } } } },
        { customer: { is: { name:  { contains: search, mode: "insensitive" } } } },
        { campaign: { is: { name:  { contains: search, mode: "insensitive" } } } },
        {
          referral: {
            is: {
              referrer: { email: { contains: search, mode: "insensitive" } },
            },
          },
        },
      ];
    }

    if (!isAdmin) {
      where.referral = { referrerId: user.id };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          customer: {
            select: { id: true, email: true, name: true, revenue: true },
          },
          campaign: {
            select: { id: true, name: true, commissionRate: true },
          },
          referral: {
            include: {
              referrer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          commissions: {
            where: {
              user: {
                role: { not: UserRole.ADMIN },
                userType: { not: UserType.ADMIN },
              },
            },
            select: {
              id: true,
              amount: true,
              percentage: true,
              status: true,
              description: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  userType: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      transactions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Get all transactions error:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
};
