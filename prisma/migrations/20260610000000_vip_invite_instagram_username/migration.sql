-- AlterTable
ALTER TABLE "vip_invites" ADD COLUMN "instagramUsername" TEXT;

-- AlterTable
ALTER TABLE "vip_invites" ALTER COLUMN "telegramId" DROP NOT NULL;
