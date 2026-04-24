-- CreateTable
CREATE TABLE "pre_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "referralId" TEXT,
    "inviteCode" TEXT,
    "teasemeUserId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "stepHistory" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pre_users_referralId_key" ON "pre_users"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "pre_users_inviteCode_key" ON "pre_users"("inviteCode");

-- CreateIndex
CREATE INDEX "pre_users_email_idx" ON "pre_users"("email");

-- AddForeignKey
ALTER TABLE "pre_users" ADD CONSTRAINT "pre_users_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
