import { PrismaClient, UserRole, UserType } from "@prisma/client";
import { Response } from "express";
import { validationResult } from "express-validator";
import { nanoid } from "nanoid";
import { AuthRequest } from "../middleware/auth.middleware";
import { getPresignedUrl } from "../services/s3.service";

const prisma = new PrismaClient();

const hasAccountManagerAccess = (user: AuthRequest["user"]) => {
  return user?.userType === UserType.ACCOUNT_MANAGER;
};

export const createReferralInvite = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { campaignId, email } = req.body;
    const user = req.user!;

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Check if campaign is active
    if (!campaign.isActive) {
      return res
        .status(400)
        .json({ error: "Cannot create invites for inactive campaigns" });
    }

    const isAdminCaller = user.role === UserRole.ADMIN;
    const isAmCaller = hasAccountManagerAccess(user);

    // Hidden campaigns are restricted to admins and account managers. AM access
    // is centralized through `hasAccountManagerAccess`, which uses `userType`
    // as the single source of truth. Pure promoters / team managers / chatters
    // still can't invite on hidden campaigns.
    if (!campaign.visibleToPromoters && !isAdminCaller && !isAmCaller) {
      return res.status(403).json({
        error: "Access denied",
        message:
          "You don't have access to this campaign. Only account managers can promote hidden campaigns.",
      });
    }

    // Check monthly invite limit (Admins and Account Managers are exempt)
    if (
      campaign.maxInvitesPerMonth &&
      campaign.maxInvitesPerMonth > 0 &&
      !isAdminCaller &&
      !isAmCaller
    ) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Count ALL person invitation attempts this month (pending + accepted)
      // Customer tracking referrals have a specific pattern: referredUserId is always null when created
      // Person invitations: referredUserId is null when pending, not null when accepted
      // To exclude customer tracking: inviteCode should not match username pattern
      const user_username = await prisma.user.findUnique({
        where: { id: user.id },
        select: { username: true, email: true },
      });

      const invitesThisMonth = await prisma.referral.count({
        where: {
          referrerId: user.id,
          campaignId: campaign.id,
          inviteCode: { not: user_username?.username || "no-match" }, // Exclude customer tracking
          createdAt: { gte: startOfMonth },
        },
      });

      if (invitesThisMonth >= campaign.maxInvitesPerMonth) {
        return res.status(403).json({
          error: `Monthly invite limit reached`,
          limit: campaign.maxInvitesPerMonth,
          current: invitesThisMonth,
          message: `You can invite up to ${campaign.maxInvitesPerMonth} people per month on this campaign`,
        });
      }
    }

    // Promoters can invite for any active campaign they're participating in
    if (user.role === UserRole.PROMOTER) {
      // Check if promoter is already part of this campaign (has been referred to it)
      const isParticipant = await prisma.referral.findFirst({
        where: {
          campaignId,
          OR: [{ referrerId: user.id }, { referredUserId: user.id }],
        },
      });

      // If not a participant yet and campaign requires approval, block
      if (!isParticipant && !campaign.autoApprove) {
        return res.status(403).json({
          error:
            "You must be approved for this campaign before inviting others",
        });
      }
    }

    // Generate unique invite code
    const inviteCode = nanoid(10);

    // Determine referral level
    let level = 1;
    let parentReferralId = null;

    // If the user is an influencer, this is a second-level referral
    if (user.role === UserRole.PROMOTER) {
      // Find the referral where this user was referred
      const userReferral = await prisma.referral.findFirst({
        where: {
          campaignId,
          referredUserId: user.id,
        },
      });

      if (userReferral) {
        level = userReferral.level + 1;
        parentReferralId = userReferral.id;
      }
    }

    const referral = await prisma.referral.create({
      data: {
        inviteCode,
        campaignId,
        referrerId: user.id,
        level,
        parentReferralId,
        status: "PENDING",
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
            defaultReferralUrl: true,
            commissionRate: true,
            secondaryRate: true,
          },
        },
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Get full user with username
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true, inviteCode: true },
    });

    // Use username as the ref code
    const refCode = fullUser?.username || fullUser?.inviteCode || user.id;

    // Generate invite URL - use campaign's defaultReferralUrl or websiteUrl
    const targetUrl =
      referral.campaign.defaultReferralUrl || referral.campaign.websiteUrl;

    // Parse URL and add tracking parameter with username
    const urlObj = new URL(targetUrl);
    urlObj.searchParams.set("fpr", refCode);

    const inviteUrl = urlObj.toString();

    res.status(201).json({
      referral,
      inviteUrl,
      inviteCode,
      message: "Referral invite created successfully",
    });
  } catch (error) {
    console.error("Create referral error:", error);
    res.status(500).json({ error: "Failed to create referral invite" });
  }
};

export const getReferralByInviteCode = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { inviteCode } = req.params;

    const referral = await prisma.referral.findUnique({
      where: { inviteCode },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            websiteUrl: true,
            commissionRate: true,
            isActive: true,
          },
        },
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Invalid invite code" });
    }

    if (referral.referredUserId) {
      return res
        .status(400)
        .json({ error: "This invite code has already been used" });
    }

    if (!referral.campaign.isActive) {
      return res
        .status(400)
        .json({ error: "This campaign is no longer active" });
    }

    res.json({ referral });
  } catch (error) {
    console.error("Get referral error:", error);
    res.status(500).json({ error: "Failed to fetch referral" });
  }
};

export const getMyReferrals = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    // Get user's username to filter customer tracking referrals
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true }
    });

    const allReferrals = await prisma.referral.findMany({
      where: { referrerId: user.id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
            commissionRate: true,
          },
        },
        referredUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            profilePhotoKey: true,
            createdAt: true,
          },
        },
        childReferrals: {
          include: {
            referredUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
                profilePhotoKey: true,
              },
            },
            commissions: {
              select: {
                id: true,
                amount: true,
                status: true,
                createdAt: true,
                userId: true,
              },
            },
          },
        },
        commissions: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            userId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter out:
    // 1. Self-referrals (referredUserId === own id, e.g. username-based tracking records)
    // 2. Customer tracking referrals (inviteCode === username or starts with username_)
    const referrals = allReferrals.filter(ref => {
      // Remove self-referrals entirely
      if (ref.referredUserId === user.id) return false;

      // Remove username-based tracking records that are still pending
      if (ref.referredUserId === null && userDetails?.username) {
        return ref.inviteCode !== userDetails.username && !ref.inviteCode.startsWith(`${userDetails.username}_`);
      }
      return true;
    });

    // Presign every unique profile photo key once, then swap the stable S3 key
    // for a short-lived URL (1h) on each referredUser before responding.
    // The DB never stores the URL; the key is the only persistent reference.
    const photoKeys = new Set<string>();
    for (const ref of referrals) {
      if (ref.referredUser?.profilePhotoKey) photoKeys.add(ref.referredUser.profilePhotoKey);
      for (const cr of ref.childReferrals) {
        if (cr.referredUser?.profilePhotoKey) photoKeys.add(cr.referredUser.profilePhotoKey);
      }
    }
    const photoUrlByKey = new Map<string, string | null>();
    await Promise.all(
      Array.from(photoKeys).map(async (key) => {
        photoUrlByKey.set(key, await getPresignedUrl(key));
      })
    );
    const hydrateReferredUser = <T extends { profilePhotoKey?: string | null } | null | undefined>(
      ru: T
    ): (Omit<NonNullable<T>, "profilePhotoKey"> & { photoUrl: string | null }) | null => {
      if (!ru) return null;
      const { profilePhotoKey, ...rest } = ru;
      return {
        ...rest,
        photoUrl: profilePhotoKey ? photoUrlByKey.get(profilePhotoKey) ?? null : null,
      } as Omit<NonNullable<T>, "profilePhotoKey"> & { photoUrl: string | null };
    };
    const hydratedReferrals = referrals.map((ref) => ({
      ...ref,
      referredUser: hydrateReferredUser(ref.referredUser),
      childReferrals: ref.childReferrals.map((cr) => ({
        ...cr,
        referredUser: hydrateReferredUser(cr.referredUser),
      })),
    }));

    // Calculate earnings
    const paidEarnings = referrals.reduce((sum, ref) => {
      return (
        sum +
        ref.commissions
          .filter((comm) => comm.status === "paid")
          .reduce((commSum, comm) => commSum + comm.amount, 0)
      );
    }, 0);

    const totalEarnings = referrals.reduce((sum, ref) => {
      return (
        sum +
        ref.commissions.reduce((commSum, comm) => commSum + comm.amount, 0)
      );
    }, 0);

    res.json({
      referrals: hydratedReferrals,
      totalEarnings,
      paidEarnings,
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter((r) => r.status === "ACTIVE").length,
    });
  } catch (error) {
    console.error("Get my referrals error:", error);
    res.status(500).json({ error: "Failed to fetch referrals" });
  }
};

export const getReferralById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        campaign: true,
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        referredUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        parentReferral: {
          include: {
            referrer: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        childReferrals: {
          include: {
            referredUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        commissions: true,
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Referral not found" });
    }

    // Check permissions
    if (
      user.role !== UserRole.ADMIN &&
      referral.referrerId !== user.id &&
      referral.referredUserId !== user.id
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ referral });
  } catch (error) {
    console.error("Get referral error:", error);
    res.status(500).json({ error: "Failed to fetch referral" });
  }
};

export const generateTrackingLink = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { campaignId } = req.body;
    const userId = req.user!.id;

    // Get full user with username
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Use username as short code (fallback to user.id if no username)
    const shortCode = user.username || user.id;

    // Get campaign website URL
    const campaignWebsiteUrl =
      campaign.websiteUrl || campaign.defaultReferralUrl;
    if (!campaignWebsiteUrl) {
      return res.status(400).json({ error: "Campaign URL not configured" });
    }

    // Create tracking link using campaign's actual URL with fpr parameter
    const urlObj = new URL(campaignWebsiteUrl);
    urlObj.searchParams.set("fpr", shortCode);
    const fullUrl = urlObj.toString();

    const trackingLink = await prisma.trackingLink.create({
      data: {
        shortCode,
        fullUrl,
        userId: user.id,
        campaignId,
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      trackingLink,
      message: "Tracking link created successfully",
    });
  } catch (error) {
    console.error("Generate tracking link error:", error);
    res.status(500).json({ error: "Failed to generate tracking link" });
  }
};

export const getMyTrackingLinks = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    const trackingLinks = await prisma.trackingLink.findMany({
      where: { userId: user.id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
          },
        },
        _count: {
          select: { clickTracking: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ trackingLinks });
  } catch (error) {
    console.error("Get tracking links error:", error);
    res.status(500).json({ error: "Failed to fetch tracking links" });
  }
};

export const trackClick = async (req: AuthRequest, res: Response) => {
  try {
    const { shortCode, ipAddress, userAgent, referrerUrl } = req.body;

    const trackingLink = await prisma.trackingLink.findUnique({
      where: { shortCode },
      include: { campaign: true },
    });

    if (!trackingLink) {
      return res.status(404).json({ error: "Tracking link not found" });
    }

    // Create click tracking record
    await prisma.clickTracking.create({
      data: {
        trackingLinkId: trackingLink.id,
        userId: trackingLink.userId,
        ipAddress,
        userAgent,
        referrerUrl,
      },
    });

    // Increment click count
    await prisma.trackingLink.update({
      where: { id: trackingLink.id },
      data: { clicks: { increment: 1 } },
    });

    // Return the campaign website URL to redirect to
    res.json({
      redirectUrl: trackingLink.campaign.websiteUrl,
      campaignName: trackingLink.campaign.name,
    });
  } catch (error) {
    console.error("Track click error:", error);
    res.status(500).json({ error: "Failed to track click" });
  }
};

export const checkInviteQuota = async (req: AuthRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const user = req.user!;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const isAdminCaller = user.role === UserRole.ADMIN;
    const isAmCaller = hasAccountManagerAccess(user);

    // Always compute real usage for this month so all response branches
    // (including the admin/AM exemption) report accurate numbers for the UI
    // and for debugging/reporting tools.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const user_username = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true },
    });

    const invitesThisMonth = await prisma.referral.count({
      where: {
        referrerId: user.id,
        campaignId: campaign.id,
        inviteCode: { not: user_username?.username || "no-match" },
        createdAt: { gte: startOfMonth },
      },
    });

    const nextResetDate = new Date(
      startOfMonth.getFullYear(),
      startOfMonth.getMonth() + 1,
      1,
    ).toISOString();

    const maxInvitesPerMonth = campaign.maxInvitesPerMonth;
    const hasFiniteLimit =
      typeof maxInvitesPerMonth === "number" && maxInvitesPerMonth > 0;
    const isUnlimited = isAdminCaller || isAmCaller || !hasFiniteLimit;

    if (isUnlimited) {
      return res.json({
        campaignId: campaign.id,
        campaignName: campaign.name,
        limit: null,
        used: invitesThisMonth,
        remaining: null,
        status: "unlimited",
        message: "You have unlimited invites on this campaign",
        nextResetDate,
        quota: {
          used: invitesThisMonth,
          remaining: 0,
          unlimited: true,
        },
      });
    }

    const limit = maxInvitesPerMonth ?? 0;
    const remaining = limit - invitesThisMonth;
    const isBlocked = remaining <= 0;
    const safeRemaining = Math.max(0, remaining);

    return res.json({
      campaignId: campaign.id,
      campaignName: campaign.name,
      limit,
      used: invitesThisMonth,
      remaining: safeRemaining,
      status: isBlocked ? "blocked" : "available",
      message: isBlocked
        ? `Monthly invite limit reached. Try again next month.`
        : `You have ${remaining} invite${remaining === 1 ? "" : "s"} remaining this month`,
      nextResetDate,
      quota: {
        used: invitesThisMonth,
        remaining: safeRemaining,
        unlimited: false,
      },
    });
  } catch (error) {
    console.error("Check invite quota error:", error);
    res.status(500).json({ error: "Failed to check invite quota" });
  }
};
