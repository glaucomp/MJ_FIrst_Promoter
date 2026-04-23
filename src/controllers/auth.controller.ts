import { PasswordResetPurpose, PrismaClient, UserRole, UserType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Response } from "express";
import { validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../middleware/auth.middleware";
import { emailService } from "../services/email.service";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  invalidateUserTokens,
  validatePasswordResetToken,
} from "../services/password-reset.service";
import { getUserTypeInfo } from "../services/user.service";
import { buildSetPasswordUrl } from "../utils/frontend-url";

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
    let userType: UserType = UserType.PROMOTER;
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

      // If invited by an admin, user becomes an account manager
      if (referral.referrer.role === UserRole.ADMIN) {
        userType = UserType.ACCOUNT_MANAGER;
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
        userType,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
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

      // AUTO-CREATE: Customer tracking referral for the new promoter
      // This allows them to track their own customer sales
      try {
        // Find the referrer's customer tracking referral (to link as parent)
        const referrerTracking = await prisma.referral.findFirst({
          where: {
            referrerId: referral.referrerId,
            referredUserId: null,  // Customer tracking referral
            status: 'ACTIVE'
          }
        });

        // Determine the appropriate campaign for the new promoter
        // Regular promoters (level 2+) should only get campaigns visible to promoters
        // They should NOT inherit hidden campaigns like "Account Manager"
        let assignedCampaignId = referral.campaignId;
        
        // If the parent campaign is hidden from promoters, use the linked campaign
        if (!referral.campaign.visibleToPromoters) {
          // Check if there's a linked campaign configured
          if (referral.campaign.linkedCampaignId) {
            assignedCampaignId = referral.campaign.linkedCampaignId;
            const linkedCampaign = await prisma.campaign.findUnique({
              where: { id: referral.campaign.linkedCampaignId },
              select: { name: true }
            });
            console.log(`✅ Assigning new promoter ${user.email} to linked campaign: ${linkedCampaign?.name}`);
          } else {
            // Fallback: find any visible campaign
            const visibleCampaign = await prisma.campaign.findFirst({
              where: {
                isActive: true,
                visibleToPromoters: true
              },
              orderBy: { createdAt: 'asc' }
            });
            
            if (visibleCampaign) {
              assignedCampaignId = visibleCampaign.id;
              console.log(`⚠️ No linked campaign configured. Assigning new promoter ${user.email} to first visible campaign: ${visibleCampaign.name}`);
            } else {
              console.warn(`❌ No visible campaigns found for new promoter ${user.email}`);
              return; // Skip customer tracking creation if no visible campaign exists
            }
          }
        }

        // Generate a unique invite code for customer tracking
        const { nanoid } = await import('nanoid');
        const customerTrackingCode = `${user.email.split('@')[0]}_${nanoid(8)}`;

        // Create customer tracking referral for the new user with the appropriate campaign
        await prisma.referral.create({
          data: {
            inviteCode: customerTrackingCode,
            campaignId: assignedCampaignId,
            referrerId: user.id,
            referredUserId: null,  // NULL means this is for tracking customers
            parentReferralId: referrerTracking?.id || null,  // Link to referrer's tracking
            status: 'ACTIVE',
            level: referral.level + 1,
            acceptedAt: new Date()
          }
        });

        console.log(`✅ Customer tracking referral created for ${user.email} (invite code: ${customerTrackingCode})`);
      } catch (error) {
        console.error('❌ Failed to create customer tracking referral:', error);
        // Don't fail the registration if customer tracking creation fails
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
            const newReferral = await prisma.referral.create({
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

            // AUTO-CREATE: Customer tracking referral for the new user
            try {
              // Find the referrer's customer tracking referral
              const referrerTracking = await prisma.referral.findFirst({
                where: {
                  referrerId: referrer.id,
                  referredUserId: null,
                  status: 'ACTIVE'
                }
              });

              // Ensure the campaign is suitable for regular promoters
              // If the found campaign is hidden, use the linked campaign
              let assignedCampaignId = campaign.id;
              if (!campaign.visibleToPromoters) {
                // Check if there's a linked campaign configured
                const fullCampaign = await prisma.campaign.findUnique({
                  where: { id: campaign.id },
                  select: { linkedCampaignId: true }
                });
                
                if (fullCampaign?.linkedCampaignId) {
                  assignedCampaignId = fullCampaign.linkedCampaignId;
                  const linkedCampaign = await prisma.campaign.findUnique({
                    where: { id: fullCampaign.linkedCampaignId },
                    select: { name: true }
                  });
                  console.log(`✅ Assigning new promoter ${user.email} to linked campaign: ${linkedCampaign?.name}`);
                } else {
                  // Fallback: find any visible campaign
                  const visibleCampaign = await prisma.campaign.findFirst({
                    where: {
                      isActive: true,
                      visibleToPromoters: true
                    },
                    orderBy: { createdAt: 'asc' }
                  });
                  
                  if (visibleCampaign) {
                    assignedCampaignId = visibleCampaign.id;
                    console.log(`⚠️ No linked campaign configured. Assigning new promoter ${user.email} to first visible campaign: ${visibleCampaign.name}`);
                  } else {
                    console.warn(`❌ No visible campaigns found for new promoter ${user.email}`);
                    return; // Skip if no visible campaign exists
                  }
                }
              }

              const { nanoid } = await import('nanoid');
              const customerTrackingCode = `${user.email.split('@')[0]}_${nanoid(8)}`;

              await prisma.referral.create({
                data: {
                  inviteCode: customerTrackingCode,
                  campaignId: assignedCampaignId,
                  referrerId: user.id,
                  referredUserId: null,
                  parentReferralId: referrerTracking?.id || null,
                  status: 'ACTIVE',
                  level: newReferral.level + 1,
                  acceptedAt: new Date()
                }
              });

              console.log(`✅ Customer tracking referral created for ${user.email}`);
            } catch (error) {
              console.error('❌ Failed to create customer tracking referral:', error);
            }
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
        userType: true,
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
        userType: true,
        isActive: true,
        createdAt: true,
        wiseEmail: true,
        wiseRecipientId: true,
        wiseRecipientType: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user type information
    const userTypeInfo = await getUserTypeInfo(req.user.id);

    res.json({ 
      user,
      typeDetails: userTypeInfo
    });
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

// POST /api/auth/forgot-password { email }
// Always responds 200 regardless of whether the email matches a real user so
// the endpoint cannot be used to enumerate accounts. When it does match an
// active user we create a short-lived RESET token and email the link.
export const forgotPassword = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // express-validator's normalizeEmail() already lowercased; trim defensively.
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, isActive: true },
    });

    if (user?.isActive) {
      try {
        const { rawToken, expiresAt } = await createPasswordResetToken(
          user.id,
          PasswordResetPurpose.RESET,
        );
        const resetUrl = buildSetPasswordUrl(rawToken);
        await emailService.sendPasswordResetEmail({
          email: user.email,
          firstName: user.firstName,
          resetUrl,
          expiresAt,
        });
      } catch (err) {
        console.error("Forgot-password email error:", err);
      }
    }

    res.json({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
};

// GET /api/auth/password-reset/:token/validate
// Lets the FE render a friendly "Welcome <name>" or "Reset for <email>"
// header before the user sets a password. Responds with `valid: false` for
// any reason (missing/expired/consumed) to avoid leaking which.
export const validateResetToken = async (req: AuthRequest, res: Response) => {
  try {
    const rawToken = req.params.token || "";
    const info = await validatePasswordResetToken(rawToken);
    if (!info) {
      return res.json({ valid: false });
    }
    res.json({
      valid: true,
      email: info.email,
      firstName: info.firstName,
      purpose: info.purpose.toLowerCase(),
    });
  } catch (error) {
    console.error("Validate reset token error:", error);
    res.status(500).json({ error: "Failed to validate token" });
  }
};

// POST /api/auth/password-reset { token, password }
// Consumes the token, writes the new password, invalidates every other
// outstanding token for the user, and returns a JWT so the FE can drop the
// user straight into their dashboard without a second login step.
export const resetPassword = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const rawToken: string = req.body.token;
    const password: string = req.body.password;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const consumed = await consumePasswordResetToken(rawToken);
      if (!consumed) {
        return null;
      }

      const user = await tx.user.update({
        where: { id: consumed.userId },
        data: {
          password: hashedPassword,
          // Invite flow doubles as activation — make sure the user can log in
          // even if the row was created with `isActive: false` for any reason.
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          userType: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Kill every other outstanding token so an unused invite email from the
      // same mailbox can't be replayed to take over the account later.
      await invalidateUserTokens(user.id);

      return { consumed, user };
    });

    if (!result) {
      return res
        .status(400)
        .json({ error: "This link is no longer valid. Please request a new one." });
    }

    const token = generateToken(result.user.id, result.user.email, result.user.role);

    res.json({
      user: result.user,
      token,
      purpose: result.consumed.purpose.toLowerCase(),
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

export const getUserType = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userTypeInfo = await getUserTypeInfo(req.user.id);

    res.json({ userTypeInfo });
  } catch (error) {
    console.error("Get user type error:", error);
    res.status(500).json({ error: "Failed to get user type" });
  }
};
