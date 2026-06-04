-- CreateEnum
CREATE TYPE "VipInviteStatus" AS ENUM ('pending', 'profile_completed', 'verified', 'logged_in', 'expired');

-- CreateTable
CREATE TABLE "vip_invites" (
    "id" TEXT NOT NULL,
    "chatterId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teasemeUserId" INTEGER NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "email" TEXT,
    "fullName" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "verificationUrl" TEXT NOT NULL,
    "status" "VipInviteStatus" NOT NULL DEFAULT 'pending',
    "lastEvent" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vip_invites_teasemeUserId_key" ON "vip_invites"("teasemeUserId");

-- CreateIndex
CREATE INDEX "vip_invites_groupId_status_idx" ON "vip_invites"("groupId", "status");

-- AddForeignKey
ALTER TABLE "vip_invites" ADD CONSTRAINT "vip_invites_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_invites" ADD CONSTRAINT "vip_invites_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "chatter_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
