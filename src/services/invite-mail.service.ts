import { PrismaClient } from "@prisma/client";

import {
  outboundFromAddress,
  type CompanyMailLogin,
} from "./email.service";

const prisma = new PrismaClient();

type MailRow = {
  mailProvider: string | null;
  mailHost: string | null;
  mailPort: number | null;
  mailUser: string | null;
  mailPassword: string | null;
  fromEmail: string | null;
  fromName: string | null;
};

/**
 * AWS can send with the app SES sender when no From address is stored.
 * SMTP still needs host, username, password, and a From address.
 */
export const usableMail = (row: MailRow | null): CompanyMailLogin | null => {
  if (row?.mailProvider === "aws") {
    return {
      provider: "aws",
      host: "",
      port: 587,
      user: "",
      password: "",
      fromEmail: row.fromEmail?.trim() ?? "",
      fromName: row.fromName,
    };
  }
  if (!row?.mailHost?.trim() || !row.mailUser?.trim() || !row.mailPassword || !row.fromEmail?.trim()) {
    return null;
  }
  const port = row.mailPort && row.mailPort > 0 ? row.mailPort : 587;
  return {
    provider: "smtp",
    host: row.mailHost.trim(),
    port,
    user: row.mailUser.trim(),
    password: row.mailPassword,
    fromEmail: row.fromEmail.trim(),
    fromName: row.fromName,
  };
};

/** Own login, then the explicit main, then the newest same-site hidden campaign with a usable mailbox. */
export const resolveInviteMail = async (campaignId: string): Promise<CompanyMailLogin | null> => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      mailProvider: true,
      mailHost: true,
      mailPort: true,
      mailUser: true,
      mailPassword: true,
      fromEmail: true,
      fromName: true,
      websiteUrl: true,
      mainCampaign: {
        select: {
          mailProvider: true,
          mailHost: true,
          mailPort: true,
          mailUser: true,
          mailPassword: true,
          fromEmail: true,
          fromName: true,
        },
      },
      linkedBy: {
        where: { visibleToPromoters: false },
        select: {
          mailProvider: true,
          mailHost: true,
          mailPort: true,
          mailUser: true,
          mailPassword: true,
          fromEmail: true,
          fromName: true,
          websiteUrl: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!campaign) return null;
  const own = usableMail(campaign);
  if (own) return own;
  const fromMain = usableMail(campaign.mainCampaign);
  if (fromMain) return fromMain;
  for (const row of campaign.linkedBy) {
    if (row.websiteUrl !== campaign.websiteUrl) continue;
    const mail = usableMail(row);
    if (mail) return mail;
  }
  return null;
};

/** From address the invite will actually use, or null when nothing can send. */
export const resolveInviteFromEmail = async (campaignId: string): Promise<string | null> => {
  const mail = await resolveInviteMail(campaignId);
  if (!mail) return null;
  const from = outboundFromAddress(mail).trim();
  return from || null;
};
