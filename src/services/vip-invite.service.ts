import { PrismaClient, VipInvite, VipInviteStatus } from "@prisma/client";
import {
  fetchVipInviteStatusesBatch,
  fetchVipUserStatus,
  normalizeVipInviteCode,
  type TeasemeVipInviteStatusRow,
  type TeasemeVipUserStatus,
  type VipInviteStatusBatchResult,
} from "./teaseme.service";

const prisma = new PrismaClient();

/** Invite codes are redeemable for 2 days from preregister (TeaseMe contract). */
export const VIP_INVITE_TTL_MS = 2 * 24 * 60 * 60 * 1_000;

const STATUS_RANK: Record<VipInviteStatus, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
  expired: -1,
};

const TERMINAL_STATUSES = new Set<VipInviteStatus>(["completed", "expired"]);

const POLLABLE_STATUSES = new Set<VipInviteStatus>(["pending", "in_progress"]);

export const VIP_INVITE_STALE_MS = 30_000;

export type VipPreregisterWebhookPayload = {
  event?: string;
  status?: string;
  user_id?: number;
  telegram_id?: number;
  instagram_username?: string;
  email?: string;
  full_name?: string;
  influencer_id?: string;
  occurred_at?: string;
};

/** Map upstream / legacy status strings to the MJ Promoter contract. */
export const parseVipInviteStatus = (
  raw: string | undefined | null,
): VipInviteStatus | null => {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/-/g, "_");
  switch (normalized) {
    case "pending":
      return "pending";
    case "in_progress":
    case "inprogress":
    case "profile_completed":
    case "profilecompleted":
      return "in_progress";
    case "completed":
    case "verified":
    case "logged_in":
    case "loggedin":
      return "completed";
    case "expired":
      return "expired";
    default:
      return null;
  }
};

export const resolveVipInviteExpiresAt = (
  invite: Pick<VipInvite, "expiresAt" | "createdAt">,
): Date =>
  invite.expiresAt ?? new Date(invite.createdAt.getTime() + VIP_INVITE_TTL_MS);

export const isVipInvitePastExpiry = (
  invite: Pick<VipInvite, "expiresAt" | "createdAt" | "status">,
  now = Date.now(),
): boolean => {
  if (invite.status === "completed" || invite.status === "expired") {
    return invite.status === "expired";
  }
  return now > resolveVipInviteExpiresAt(invite).getTime();
};

export const shouldAdvanceVipStatus = (
  current: VipInviteStatus,
  incoming: VipInviteStatus,
): boolean => {
  if (incoming === current) return true;
  if (incoming === "expired") {
    return current === "pending" || current === "in_progress";
  }
  if (current === "expired" || current === "completed") return false;
  return STATUS_RANK[incoming] > STATUS_RANK[current];
};

const normalizeInviteEmail = (raw: string | null | undefined): string | null => {
  const trimmed = raw?.trim().toLowerCase();
  return trimmed || null;
};

const resolveUpstreamVipStatus = (
  row: Pick<TeasemeVipInviteStatusRow, "status" | "is_verified">,
): VipInviteStatus | null => {
  if (row.is_verified) return "completed";
  return parseVipInviteStatus(row.status);
};

const resolveUserStatusVipStatus = (
  row: Pick<TeasemeVipUserStatus, "status" | "is_verified">,
): VipInviteStatus | null => {
  if (row.is_verified) return "completed";
  return parseVipInviteStatus(row.status);
};

export const applyVipInviteStatusUpdate = async (
  invite: VipInvite,
  params: {
    status?: VipInviteStatus;
    event?: string | null;
    occurredAt?: Date | null;
    inviteCode?: string | null;
    expiresAt?: Date | null;
    instagramUsername?: string | null;
    email?: string | null;
    fullName?: string | null;
    telegramId?: bigint | number | null;
  },
): Promise<VipInvite> => {
  const occurredAt = params.occurredAt ?? new Date();
  const nextEvent = params.event ?? null;
  const incomingStatus = params.status ?? invite.status;

  const data: {
    status?: VipInviteStatus;
    lastEvent?: string;
    lastEventAt?: Date;
    inviteCode?: string;
    expiresAt?: Date;
    instagramUsername?: string;
    email?: string;
    fullName?: string;
    telegramId?: bigint;
  } = {};

  if (
    incomingStatus !== invite.status &&
    shouldAdvanceVipStatus(invite.status, incomingStatus)
  ) {
    data.status = incomingStatus;
  }
  if (nextEvent && nextEvent !== (invite.lastEvent ?? null)) {
    data.lastEvent = nextEvent;
    data.lastEventAt = occurredAt;
  } else if (data.status) {
    data.lastEventAt = occurredAt;
  }
  if (params.inviteCode?.trim() && params.inviteCode.trim() !== invite.inviteCode) {
    data.inviteCode = params.inviteCode.trim();
  }
  if (params.expiresAt && params.expiresAt.getTime() !== invite.expiresAt?.getTime()) {
    data.expiresAt = params.expiresAt;
  }
  if (
    params.instagramUsername?.trim() &&
    params.instagramUsername.trim() !== (invite.instagramUsername ?? "")
  ) {
    data.instagramUsername = params.instagramUsername.trim();
  }

  const nextEmail = normalizeInviteEmail(params.email);
  if (nextEmail && nextEmail !== normalizeInviteEmail(invite.email)) {
    data.email = nextEmail;
  }
  if (params.fullName?.trim() && params.fullName.trim() !== invite.fullName) {
    data.fullName = params.fullName.trim();
  }
  if (params.telegramId != null) {
    const nextTelegramId = BigInt(params.telegramId);
    if (invite.telegramId?.toString() !== nextTelegramId.toString()) {
      data.telegramId = nextTelegramId;
    }
  }

  if (Object.keys(data).length === 0) return invite;

  if (data.status && !shouldAdvanceVipStatus(invite.status, data.status)) {
    delete data.status;
    if (Object.keys(data).length === 0) return invite;
  }

  if (data.status) {
    const attempted = await prisma.vipInvite.updateMany({
      where: { id: invite.id, status: invite.status },
      data,
    });

    if (attempted.count === 0) {
      const fresh = await prisma.vipInvite.findUnique({ where: { id: invite.id } });
      return fresh ?? invite;
    }
  } else {
    await prisma.vipInvite.update({
      where: { id: invite.id },
      data,
    });
  }

  const updated = await prisma.vipInvite.findUnique({ where: { id: invite.id } });
  return updated ?? invite;
};

/** Mark unredeemed invites as expired once past expiresAt / 2-day TTL. */
export const expireVipInviteIfNeeded = async (
  invite: VipInvite,
): Promise<VipInvite> => {
  if (!POLLABLE_STATUSES.has(invite.status)) return invite;
  if (!isVipInvitePastExpiry(invite)) return invite;

  return applyVipInviteStatusUpdate(invite, {
    status: "expired",
    event: "invite_expired",
    occurredAt: resolveVipInviteExpiresAt(invite),
  });
};

const applyUpstreamStatusRow = async (
  invite: VipInvite,
  row: TeasemeVipInviteStatusRow,
): Promise<VipInvite> => {
  const status = resolveUpstreamVipStatus(row);
  let next = await applyVipInviteStatusUpdate(invite, {
    ...(status ? { status } : {}),
    event: "poll_reconcile",
    occurredAt: new Date(),
    inviteCode: row.invite_code ?? null,
    expiresAt:
      row.expires_at && !Number.isNaN(Date.parse(row.expires_at))
        ? new Date(row.expires_at)
        : null,
    instagramUsername: row.instagram_username ?? null,
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    telegramId: row.telegram_id ?? null,
  });

  return expireVipInviteIfNeeded(next);
};

const lookupVipInviteStatusRow = (
  invite: VipInvite,
  batch: VipInviteStatusBatchResult,
): TeasemeVipInviteStatusRow | undefined => {
  const byCode = batch.byInviteCode.get(normalizeVipInviteCode(invite.inviteCode));
  if (byCode) return byCode;
  return batch.byUserId.get(invite.teasemeUserId);
};

const buildVipInviteStatusBatchRequest = (
  invites: VipInvite[],
): { inviteCodes: string[]; userIds: number[] } => ({
  inviteCodes: invites.map((invite) => invite.inviteCode).filter(Boolean),
  userIds: invites.map((invite) => invite.teasemeUserId),
});

const applyVipUserStatusRow = async (
  invite: VipInvite,
  row: TeasemeVipUserStatus,
): Promise<VipInvite> => {
  const status = resolveUserStatusVipStatus(row);
  let next = await applyVipInviteStatusUpdate(invite, {
    ...(status ? { status } : {}),
    event: "poll_user_status",
    occurredAt: new Date(),
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    telegramId: row.telegram_id ?? null,
  });

  return expireVipInviteIfNeeded(next);
};

export const reconcileVipInviteFromTeaseme = async (
  invite: VipInvite,
): Promise<VipInvite> => {
  const batch = await fetchVipInviteStatusesBatch(
    buildVipInviteStatusBatchRequest([invite]),
  );
  const row = lookupVipInviteStatusRow(invite, batch);
  if (row) return applyUpstreamStatusRow(invite, row);

  const userStatus = await fetchVipUserStatus(invite.teasemeUserId);
  if (userStatus?.found) return applyVipUserStatusRow(invite, userStatus);

  return expireVipInviteIfNeeded(invite);
};

export const reconcileVipInvitesFromTeaseme = async (
  invites: VipInvite[],
): Promise<VipInvite[]> => {
  if (invites.length === 0) return invites;

  const pollable = invites.filter((i) => POLLABLE_STATUSES.has(i.status));
  const batch =
    pollable.length > 0
      ? await fetchVipInviteStatusesBatch(
          buildVipInviteStatusBatchRequest(pollable),
        )
      : { byUserId: new Map(), byInviteCode: new Map() };

  const byId = new Map(invites.map((i) => [i.id, i]));

  for (const invite of invites) {
    let next = invite;
    const row = lookupVipInviteStatusRow(invite, batch);
    if (row && POLLABLE_STATUSES.has(invite.status)) {
      next = await applyUpstreamStatusRow(invite, row);
    } else if (POLLABLE_STATUSES.has(invite.status)) {
      const userStatus = await fetchVipUserStatus(invite.teasemeUserId);
      if (userStatus?.found) {
        next = await applyVipUserStatusRow(invite, userStatus);
      } else {
        next = await expireVipInviteIfNeeded(invite);
      }
    } else {
      next = await expireVipInviteIfNeeded(invite);
    }
    byId.set(next.id, next);
  }

  return invites.map((i) => byId.get(i.id) ?? i);
};

export const maybeReconcileStaleVipInvite = async (
  invite: VipInvite,
): Promise<VipInvite> => {
  let next = await expireVipInviteIfNeeded(invite);
  if (!POLLABLE_STATUSES.has(next.status)) return next;

  const lastAt = next.lastEventAt ?? next.createdAt;
  const ageMs = Date.now() - lastAt.getTime();
  if (ageMs <= VIP_INVITE_STALE_MS) return next;

  return reconcileVipInviteFromTeaseme(next);
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
  const occurredAt =
    payload.occurred_at && !Number.isNaN(Date.parse(payload.occurred_at))
      ? new Date(payload.occurred_at)
      : new Date();

  if (!status) {
    console.warn("[vip-preregister-webhook] invalid status", payload);
    await applyVipInviteStatusUpdate(invite, {
      event: payload.event ?? null,
      occurredAt,
      instagramUsername: payload.instagram_username ?? null,
      email: payload.email ?? null,
      fullName: payload.full_name ?? null,
      telegramId: payload.telegram_id ?? null,
    });
    return { matched: true };
  }

  if (
    invite.lastEvent === payload.event &&
    invite.status === status &&
    invite.lastEventAt &&
    Math.abs(invite.lastEventAt.getTime() - occurredAt.getTime()) < 1000 &&
    normalizeInviteEmail(payload.email) === normalizeInviteEmail(invite.email)
  ) {
    return { matched: true };
  }

  await applyVipInviteStatusUpdate(invite, {
    status,
    event: payload.event ?? null,
    occurredAt,
    instagramUsername: payload.instagram_username ?? null,
    email: payload.email ?? null,
    fullName: payload.full_name ?? null,
    telegramId: payload.telegram_id ?? null,
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
  invite_code: invite.inviteCode,
  teaseme_user_id: invite.teasemeUserId,
  expires_at: resolveVipInviteExpiresAt(invite).toISOString(),
  email: invite.email,
  full_name: invite.fullName,
  instagram_username: invite.instagramUsername,
});

export const createVipInviteRecord = async (params: {
  chatterId: string;
  groupId: string;
  teasemeUserId: number;
  instagramUsername: string;
  fullName: string;
  influencerId: string;
  inviteCode: string;
  expiresAt?: Date | null;
}) => {
  const expiresAt =
    params.expiresAt ??
    new Date(Date.now() + VIP_INVITE_TTL_MS);

  const data = {
    chatterId: params.chatterId,
    groupId: params.groupId,
    teasemeUserId: params.teasemeUserId,
    instagramUsername: params.instagramUsername,
    fullName: params.fullName,
    influencerId: params.influencerId,
    inviteCode: params.inviteCode,
    expiresAt,
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
      instagramUsername: params.instagramUsername,
      fullName: params.fullName,
      influencerId: params.influencerId,
      inviteCode: params.inviteCode,
      expiresAt,
      lastEvent: "link_generated",
      lastEventAt: new Date(),
    },
  });
};
