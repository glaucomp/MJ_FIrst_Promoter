/**
 * Cancel ACTIVE Sugar Scratchie referrals that were invented by AM campaign
 * sync (am-campaign-added / am-multi-campaign-enroll / manual-am-assign) and
 * never started onboarding (no preUser, or currentStep still 0).
 *
 * Real Sugar applicants (confirm email/name → step >= 1) are left alone.
 * TeaseMe campaign rows are left alone.
 *
 * Usage:
 *   npx ts-node scripts/cancel-sugar-bulk-enroll.ts
 *   npx ts-node scripts/cancel-sugar-bulk-enroll.ts --apply
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BULK_SOURCES = new Set([
  "am-campaign-added",
  "am-multi-campaign-enroll",
  "manual-am-assign",
]);

const isSugarScratchCampaign = (name?: string | null): boolean =>
  (name || "").toLowerCase().includes("sugar scratch");

const referralSource = (metadata: Prisma.JsonValue | null): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const source = (metadata as Record<string, unknown>).source;
  return typeof source === "string" ? source : null;
};

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.referral.findMany({
    where: {
      status: "ACTIVE",
      referredUserId: { not: null },
      campaign: {
        visibleToPromoters: true,
        name: { contains: "sugar scratch", mode: "insensitive" },
      },
    },
    select: {
      id: true,
      inviteCode: true,
      metadata: true,
      campaign: { select: { id: true, name: true } },
      referredUser: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      preUser: { select: { id: true, email: true, currentStep: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const targets = rows.filter((row) => {
    if (!isSugarScratchCampaign(row.campaign.name)) return false;
    const source = referralSource(row.metadata);
    if (!source || !BULK_SOURCES.has(source)) return false;
    const step = row.preUser?.currentStep ?? 0;
    return step < 1;
  });

  console.log(
    apply
      ? `Applying cancel for ${targets.length} row(s)…`
      : `Dry-run: would cancel ${targets.length} row(s). Pass --apply to write.`,
  );
  console.log(`Scanned ${rows.length} ACTIVE Sugar Scratchie invitee referral(s).\n`);

  if (targets.length === 0) {
    console.log("Nothing to cancel.");
    return;
  }

  for (const row of targets) {
    const name = [row.referredUser?.firstName, row.referredUser?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const label = name || row.referredUser?.email || row.preUser?.email || "(unknown)";
    console.log(
      `- ${label} | email=${row.referredUser?.email ?? "—"} | invite=${row.inviteCode} | source=${referralSource(row.metadata)} | step=${row.preUser?.currentStep ?? 0} | campaign=${row.campaign.name}`,
    );
  }

  if (!apply) {
    console.log("\nRe-run with --apply to cancel these rows.");
    return;
  }

  const migratedAt = new Date().toISOString();
  for (const row of targets) {
    const existing =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    await prisma.referral.update({
      where: { id: row.id },
      data: {
        status: "CANCELLED",
        metadata: {
          ...existing,
          source: "am-migration",
          migratedAt,
          reason: "sugar-bulk-enroll",
          previousBulkSource: referralSource(row.metadata),
        } as Prisma.InputJsonValue,
      },
    });
  }

  console.log(`\nCancelled ${targets.length} referral(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
