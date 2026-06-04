import { timingSafeEqual } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  UserType,
  VipInviteStatus,
} from "@prisma/client";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  chatterCanAccessVipInvite,
  handleVipPreregisterWebhook,
  isVipInvitePollingActive,
  reconcileVipInviteFromTeaseme,
  serializeVipInviteStatus,
  vipInviteRecipientName,
  VipPreregisterWebhookPayload,
} from "../services/vip-invite.service";
import { sendVipInviteEmailViaTeaseme } from "../services/teaseme.service";

const prisma = new PrismaClient();

/**
 * POST /api/webhooks/teaseme/vip-preregister
 *
 * Inbound lifecycle updates from TeaseMe for VIP preregister users.
 * Auth via x-webhook-secret (TEASEME_VIP_WEBHOOK_SECRET).
 */
export const receiveVipPreregisterWebhook = async (
  req: Request,
  res: Response,
) => {
  const expectedSecret = process.env.TEASEME_VIP_WEBHOOK_SECRET;
  const rawHeader = req.headers["x-webhook-secret"];
  const receivedSecret = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const isValid =
    !!expectedSecret &&
    !!receivedSecret &&
    expectedSecret.length === receivedSecret.length &&
    timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(receivedSecret));
  if (!isValid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await handleVipPreregisterWebhook(req.body as VipPreregisterWebhookPayload);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[vip-preregister-webhook] handler error:", error);
    return res.status(200).json({ ok: true });
  }
};

/** GET /api/chatters/vip-invites/:inviteId/status */
export const getVipInviteStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.user.userType !== UserType.CHATTER) {
      return res
        .status(403)
        .json({ error: "Only chatters can view VIP invite status" });
    }

    const inviteId = String(req.params.inviteId ?? "").trim();
    if (!inviteId) {
      return res.status(400).json({ error: "inviteId is required" });
    }

    let invite = await prisma.vipInvite.findUnique({ where: { id: inviteId } });
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    const allowed = await chatterCanAccessVipInvite(req.user.id, invite);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (isVipInvitePollingActive(invite.status)) {
      invite = await reconcileVipInviteFromTeaseme(invite);
    }

    return res.json(serializeVipInviteStatus(invite));
  } catch (error) {
    console.error("Get VIP invite status error:", error);
    return res.status(500).json({ error: "Failed to fetch invite status" });
  }
};

/** POST /api/chatters/vip-invites/:inviteId/send-email */
export const sendVipInviteEmail = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.user.userType !== UserType.CHATTER) {
      return res
        .status(403)
        .json({ error: "Only chatters can send VIP invite emails" });
    }

    const inviteId = String(req.params.inviteId ?? "").trim();
    if (!inviteId) {
      return res.status(400).json({ error: "inviteId is required" });
    }

    const invite = await prisma.vipInvite.findUnique({ where: { id: inviteId } });
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    const allowed = await chatterCanAccessVipInvite(req.user.id, invite);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const recipientEmail = invite.email?.trim();
    if (!recipientEmail) {
      return res.status(422).json({
        error:
          "This invite has no email on file. Add an email when generating the link.",
      });
    }

    const result = await sendVipInviteEmailViaTeaseme({
      to_email: recipientEmail,
      verification_url: invite.verificationUrl,
      influencer_id: invite.influencerId,
      recipient_name: vipInviteRecipientName(invite.fullName),
    });

    if (!result.ok) {
      return res.status(result.status >= 400 ? result.status : 502).json({
        error: result.error,
      });
    }

    return res.json({
      ok: true,
      message: result.message,
      email: recipientEmail,
      message_id: result.message_id ?? undefined,
      email_subject: result.email_subject ?? undefined,
    });
  } catch (error) {
    console.error("Send VIP invite email error:", error);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
};

/** GET /api/chatters/vip-invites?groupId= */
export const listVipInvites = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.user.userType !== UserType.CHATTER) {
      return res
        .status(403)
        .json({ error: "Only chatters can list VIP invites" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        error: "Validation failed",
        errors: errors.array(),
      });
    }

    const groupId = String(req.query.groupId).trim();
    const searchRaw =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const membership = await prisma.chatterGroupMember.findUnique({
      where: {
        chatterId_groupId: { chatterId: req.user.id, groupId },
      },
    });
    if (!membership) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const where: Prisma.VipInviteWhereInput = { groupId };
    if (searchRaw) {
      const or: Prisma.VipInviteWhereInput[] = [
        { fullName: { contains: searchRaw, mode: "insensitive" } },
        { email: { contains: searchRaw, mode: "insensitive" } },
      ];
      if (/^\d+$/.test(searchRaw)) {
        or.push({ telegramId: BigInt(searchRaw) });
      }
      where.OR = or;
    }

    const invites = await prisma.vipInvite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return res.json({
      invites: invites.map((invite) => ({
        ...serializeVipInviteStatus(invite),
        full_name: invite.fullName,
        email: invite.email,
        influencer_id: invite.influencerId,
        telegram_id: invite.telegramId.toString(),
        created_at: invite.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("List VIP invites error:", error);
    return res.status(500).json({ error: "Failed to list invites" });
  }
};

export const createVipInviteRecord = async (params: {
  chatterId: string;
  groupId: string;
  teasemeUserId: number;
  telegramId: number;
  email?: string;
  fullName: string;
  influencerId: string;
  verificationUrl: string;
}) => {
  const data = {
    chatterId: params.chatterId,
    groupId: params.groupId,
    teasemeUserId: params.teasemeUserId,
    telegramId: BigInt(params.telegramId),
    email: params.email ?? null,
    fullName: params.fullName,
    influencerId: params.influencerId,
    verificationUrl: params.verificationUrl,
    status: VipInviteStatus.pending,
    lastEvent: "link_generated",
    lastEventAt: new Date(),
  };

  return prisma.vipInvite.upsert({
    where: { teasemeUserId: params.teasemeUserId },
    create: data,
    update: {
      chatterId: params.chatterId,
      groupId: params.groupId,
      telegramId: BigInt(params.telegramId),
      email: params.email ?? null,
      fullName: params.fullName,
      influencerId: params.influencerId,
      verificationUrl: params.verificationUrl,
      status: VipInviteStatus.pending,
      lastEvent: "link_generated",
      lastEventAt: new Date(),
    },
  });
};
