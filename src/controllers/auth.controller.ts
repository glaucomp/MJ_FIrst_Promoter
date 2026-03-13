import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../middleware/auth.middleware";

const prisma = new PrismaClient();

const generateToken = (userId: string, email: string, role: UserRole) => {
  const secret =
    process.env.JWT_SECRET || "default_secret_change_in_production";
  return jwt.sign({ id: userId, email, role }, secret, { expiresIn: "7d" });
};

export const register = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, inviteCode, refCode } =
      req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine role and handle invite code
    let role: UserRole = UserRole.PROMOTER;
    let referral = null;

    if (inviteCode) {
      // Find the referral by invite code
      referral = await prisma.referral.findUnique({
        where: { inviteCode },
        include: { campaign: true, referrer: true },
      });

      if (!referral) {
        return res.status(400).json({ error: "Invalid invite code" });
      }

      if (referral.referredUserId) {
        return res.status(400).json({ error: "Invite code already used" });
      }
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    // Update referral if invite code was used
    if (referral) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          referredUserId: user.id,
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
      });

      // If this is a second-level referral, the new user becomes an account manager for their own sub-campaign
      if (referral.level === 1) {
        // Create a new referral relationship for multi-level tracking
        // The influencer who referred this user can now track their referrals
      }
    }

    // Handle refCode - find referrer and create referral record
    if (refCode) {
      try {
        // Find the referrer by username or inviteCode
        const referrer = await prisma.user.findFirst({
          where: {
            OR: [{ username: refCode }, { inviteCode: refCode }],
          },
        });

        if (referrer) {
          // Find an active campaign
          const campaign = await prisma.campaign.findFirst({
            where: {
              isActive: true,
              visibleToPromoters: true,
            },
          });

          if (campaign) {
            // Create a referral record
            await prisma.referral.create({
              data: {
                inviteCode: `${refCode}-${user.id.substring(0, 8)}`,
                campaignId: campaign.id,
                referrerId: referrer.id,
                referredUserId: user.id,
                status: "ACTIVE",
                level: 1,
                acceptedAt: new Date(),
              },
            });

            console.log(
              `✅ Referral created: ${user.email} referred by ${referrer.username || referrer.email}`,
            );
          }
        } else {
          console.warn(`⚠️ Referrer not found for refCode: ${refCode}`);
        }

        // Also track in MJ Promoter Python service
        const mjfpUrl = process.env.MJFP_API_URL;
        const mjfpToken = process.env.MJFP_TOKEN;
        const mjfpAccountId = process.env.MJFP_ACCOUNT_ID;

        if (mjfpToken && mjfpAccountId) {
          const trackResponse = await fetch(`${mjfpUrl}/v2/track/signup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${mjfpToken}`,
              "Account-ID": mjfpAccountId,
            },
            body: JSON.stringify({
              email: user.email,
              uid: user.id,
              tid: refCode,
            }),
          });

          if (trackResponse.ok) {
            console.log(
              `✅ MJ Promoter signup tracked: ${email} -> ${refCode}`,
            );
          } else {
            console.warn(
              `⚠️ MJ Promoter signup tracking failed: ${trackResponse.status}`,
            );
          }
        }
      } catch (error) {
        console.error("Referral/MJFP tracking error:", error);
      }
    }

    const token = generateToken(user.id, user.email, user.role);

    res.status(201).json({
      user,
      token,
      message: inviteCode
        ? "Registration successful with referral"
        : "Registration successful",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
};

export const login = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user.id, user.email, user.role);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

export const refreshToken = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const token = generateToken(req.user.id, req.user.email, req.user.role);

    res.json({ token });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({ error: "Failed to refresh token" });
  }
};
