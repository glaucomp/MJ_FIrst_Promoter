import { PrismaClient, VipInvite, VipInviteStatus } from "@prisma/client";
import { fetchVipUserStatus } from "./teaseme.service";

const prisma = new PrismaClient();

const STATUS_RANK: Record<VipInviteStatus, number> = {
  pending: 0,
  profile_completed: 1,
  verified: 2,
  logged_in: 3,
  expired: -1,
};

const TERMINAL_STATUSES = new Set<VipInviteStatus>([
  "verified",
  "logged_in",
  "expired",
]);

const POLLABLE_STATUSES = new Set<VipInviteStatus>([
  "pending",
  "profile_completed",
]);

export const VIP_INVITE_STALE_MS = 30_000;

export type VipPreregisterWebhookPayload = {
  event?: string;
  status?: string;
  user_id?: number;
  telegram_id?: number;
  email?: string;
  full_name?: string;
  influencer_id?: string;
  occurred_at?: string;
};

export const parseVipInviteStatus = (
  raw: string | undefined | null,
): VipInviteStatus | null => {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "profile_completed" ||
    normalized === "verified" ||
    normalized === "logged_in" ||
    normalized === "expired"
  ) {
    return normalized;
  }
  return null;
};

export const shouldAdvanceVipStatus = (
  current: VipInviteStatus,
  incoming: VipInviteStatus,
): boolean => {
  if (incoming === current) return true;
  if (incoming === "expired") {
    return current === "pending" || current === "profile_completed";
  }
  if (current === "expired") return false;
  return STATUS_RANK[incoming] > STATUS_RANK[current];
};

export const applyVipInviteStatusUpdate = async (
  invite: VipInvite,
  params: {
    status: VipInviteStatus;
    event?: string | null;
    occurredAt?: Date | null;
  },
): Promise<VipInvite> => {
  if (!shouldAdvanceVipStatus(invite.status, params.status)) {
    return invite;
  }

  const occurredAt = params.occurredAt ?? new Date();
  return prisma.vipInvite.update({
    where: { id: invite.id },
    data: {
      status: params.status,
      ...(params.event ? { lastEvent: params.event } : {}),
      lastEventAt: occurredAt,
    },
  });
};

export const reconcileVipInviteFromTeaseme = async (
  invite: VipInvite,
): Promise<VipInvite> => {
  const upstream = await fetchVipUserStatus(invite.teasemeUserId);
  if (!upstream?.found || !upstream.status) return invite;

  const status = parseVipInviteStatus(upstream.status);
  if (!status) return invite;

  return applyVipInviteStatusUpdate(invite, {
    status,
    event: "poll_reconcile",
    occurredAt: upstream.updated_at
      ? new Date(upstream.updated_at)
      : new Date(),
  });
};

export const maybeReconcileStaleVipInvite = async (
  invite: VipInvite,
): Promise<VipInvite> => {
  if (!POLLABLE_STATUSES.has(invite.status)) return invite;

  const lastAt = invite.lastEventAt ?? invite.createdAt;
  const ageMs = Date.now() - lastAt.getTime();
  if (ageMs <= VIP_INVITE_STALE_MS) return invite;

  return reconcileVipInviteFromTeaseme(invite);
};

export const isVipInvitePollingActive = (status: VipInviteStatus): boolean =>
  POLLABLE_STATUSES.has(status);

export const isVipInviteTerminal = (status: VipInviteStatus): boolean =>
  TERMINAL_STATUSES.has(status);

export const handleVipPreregisterWebhook = async (
  payload: VipPreregisterWebhookPayload,
): Promise<{ matched: boolean }> => {
  const userId = payload.user_id;
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId < 1) {
    console.warn("[vip-preregister-webhook] missing or invalid user_id", payload);
    return { matched: false };
  }

  const invite = await prisma.vipInvite.findUnique({
    where: { teasemeUserId: userId },
  });
  if (!invite) {
    console.warn("[vip-preregister-webhook] no invite for teaseme user", {
      userId,
    });
    return { matched: false };
  }

  const status = parseVipInviteStatus(payload.status);
  if (!status) {
    console.warn("[vip-preregister-webhook] invalid status", payload);
    return { matched: true };
  }

  const occurredAt =
    payload.occurred_at && !Number.isNaN(Date.parse(payload.occurred_at))
      ? new Date(payload.occurred_at)
      : new Date();

  // Idempotency: same event + unchanged status is a no-op but still ok.
  if (
    invite.lastEvent === payload.event &&
    invite.status === status &&
    invite.lastEventAt &&
    Math.abs(invite.lastEventAt.getTime() - occurredAt.getTime()) < 1000
  ) {
    return { matched: true };
  }

  await applyVipInviteStatusUpdate(invite, {
    status,
    event: payload.event ?? null,
    occurredAt,
  });

  return { matched: true };
};

export const chatterCanAccessVipInvite = async (
  chatterId: string,
  invite: Pick<VipInvite, "chatterId" | "groupId">,
): Promise<boolean> => {
  if (invite.chatterId === chatterId) return true;
  const membership = await prisma.chatterGroupMember.findUnique({
    where: {
      chatterId_groupId: { chatterId, groupId: invite.groupId },
    },
  });
  return !!membership;
};

/** First token of full_name for VIP invite email greeting (e.g. "kako" from "kako smith"). */
export const vipInviteRecipientName = (
  fullName: string | null | undefined,
): string | undefined => {
  const first = fullName?.trim().split(/\s+/)[0]?.trim();
  return first || undefined;
};

export const serializeVipInviteStatus = (invite: VipInvite) => ({
  invite_id: invite.id,
  status: invite.status,
  last_event_at: invite.lastEventAt?.toISOString() ?? null,
  verification_url: invite.verificationUrl,
  teaseme_user_id: invite.teasemeUserId,
});
