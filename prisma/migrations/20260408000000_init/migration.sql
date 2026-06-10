-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROMOTER');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('ADMIN', 'ACCOUNT_MANAGER', 'TEAM_MANAGER', 'PROMOTER', 'CHATTER', 'PAYER');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PasswordResetPurpose" AS ENUM ('INVITE', 'RESET');

-- CreateEnum
CREATE TYPE "VipInviteStatus" AS ENUM ('pending', 'profile_completed', 'verified', 'logged_in', 'expired');

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "token" TEXT,
    "accountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "inviteCode" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PROMOTER',
    "userType" "UserType" NOT NULL DEFAULT 'PROMOTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "wiseEmail" TEXT,
    "wiseRecipientId" TEXT,
    "wiseRecipientType" TEXT,
    "chatterGroupId" TEXT,
    "voiceId" TEXT,
    "profilePhotoKey" TEXT,
    "profileVideoKey" TEXT,
    "teasemeSyncedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "accountManagerId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "PasswordResetPurpose" NOT NULL DEFAULT 'INVITE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "secondaryRate" DOUBLE PRECISION,
    "recurringRate" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "cookieLifeDays" INTEGER NOT NULL DEFAULT 60,
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "defaultReferralUrl" TEXT,
    "visibleToPromoters" BOOLEAN NOT NULL DEFAULT true,
    "maxInvitesPerMonth" INTEGER,
    "linkedCampaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "level" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "campaignId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT,
    "parentReferralId" TEXT,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "referralId" TEXT,
    "inviteCode" TEXT,
    "teasemeUserId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "surveyLink" TEXT,
    "assetLink" TEXT,
    "stepHistory" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "welcomeEmailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_links" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "fullUrl" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "tracking_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "click_tracking" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referrerUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackingLinkId" TEXT NOT NULL,
    "userId" TEXT,
    "referralId" TEXT,

    CONSTRAINT "click_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "subscriptionType" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT NOT NULL,
    "referralId" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sale',
    "saleAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,
    "campaignId" TEXT,
    "referralId" TEXT,
    "originalTransactionId" TEXT,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "saleAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "wiseTransferId" TEXT,
    "wiseStatus" TEXT,
    "type" TEXT NOT NULL DEFAULT 'promoter',
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "referralId" TEXT,
    "customerId" TEXT,
    "transactionId" TEXT,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatter_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "commissionPercentage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "chatter_groups_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "social_links" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_videos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "s3Key" TEXT NOT NULL,
    "userType" "UserType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatter_group_members" (
    "id" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatterId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "chatter_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_token_key" ON "api_keys"("token");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_token_idx" ON "api_keys"("token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_inviteCode_key" ON "users"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_chatterGroupId_key" ON "users"("chatterGroupId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_inviteCode_idx" ON "users"("inviteCode");

-- CreateIndex
CREATE INDEX "users_createdById_idx" ON "users"("createdById");

-- CreateIndex
CREATE INDEX "users_accountManagerId_idx" ON "users"("accountManagerId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "campaigns_createdById_idx" ON "campaigns"("createdById");

-- CreateIndex
CREATE INDEX "campaigns_isActive_idx" ON "campaigns"("isActive");

-- CreateIndex
CREATE INDEX "campaigns_linkedCampaignId_idx" ON "campaigns"("linkedCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_inviteCode_key" ON "referrals"("inviteCode");

-- CreateIndex
CREATE INDEX "referrals_inviteCode_idx" ON "referrals"("inviteCode");

-- CreateIndex
CREATE INDEX "referrals_campaignId_idx" ON "referrals"("campaignId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_idx" ON "referrals"("referrerId");

-- CreateIndex
CREATE INDEX "referrals_referredUserId_idx" ON "referrals"("referredUserId");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pre_users_referralId_key" ON "pre_users"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "pre_users_inviteCode_key" ON "pre_users"("inviteCode");

-- CreateIndex
CREATE INDEX "pre_users_email_idx" ON "pre_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_links_shortCode_key" ON "tracking_links"("shortCode");

-- CreateIndex
CREATE INDEX "tracking_links_shortCode_idx" ON "tracking_links"("shortCode");

-- CreateIndex
CREATE INDEX "tracking_links_userId_idx" ON "tracking_links"("userId");

-- CreateIndex
CREATE INDEX "tracking_links_campaignId_idx" ON "tracking_links"("campaignId");

-- CreateIndex
CREATE INDEX "click_tracking_trackingLinkId_idx" ON "click_tracking"("trackingLinkId");

-- CreateIndex
CREATE INDEX "click_tracking_createdAt_idx" ON "click_tracking"("createdAt");

-- CreateIndex
CREATE INDEX "customers_campaignId_idx" ON "customers"("campaignId");

-- CreateIndex
CREATE INDEX "customers_referralId_idx" ON "customers"("referralId");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_eventId_key" ON "transactions"("eventId");

-- CreateIndex
CREATE INDEX "transactions_eventId_idx" ON "transactions"("eventId");

-- CreateIndex
CREATE INDEX "transactions_customerId_idx" ON "transactions"("customerId");

-- CreateIndex
CREATE INDEX "transactions_campaignId_idx" ON "transactions"("campaignId");

-- CreateIndex
CREATE INDEX "commissions_userId_idx" ON "commissions"("userId");

-- CreateIndex
CREATE INDEX "commissions_campaignId_idx" ON "commissions"("campaignId");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- CreateIndex
CREATE INDEX "commissions_customerId_idx" ON "commissions"("customerId");

-- CreateIndex
CREATE INDEX "commissions_transactionId_idx" ON "commissions"("transactionId");

-- CreateIndex
CREATE INDEX "commissions_type_idx" ON "commissions"("type");

-- CreateIndex
CREATE INDEX "chatter_groups_createdById_idx" ON "chatter_groups"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "vip_invites_teasemeUserId_key" ON "vip_invites"("teasemeUserId");

-- CreateIndex
CREATE INDEX "vip_invites_groupId_status_idx" ON "vip_invites"("groupId", "status");

-- CreateIndex
CREATE INDEX "social_links_userId_idx" ON "social_links"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "social_links_userId_platform_key" ON "social_links"("userId", "platform");

-- CreateIndex
CREATE INDEX "help_videos_userType_isActive_idx" ON "help_videos"("userType", "isActive");

-- CreateIndex
CREATE INDEX "chatter_group_members_chatterId_idx" ON "chatter_group_members"("chatterId");

-- CreateIndex
CREATE INDEX "chatter_group_members_groupId_idx" ON "chatter_group_members"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "chatter_group_members_chatterId_groupId_key" ON "chatter_group_members"("chatterId", "groupId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_chatterGroupId_fkey" FOREIGN KEY ("chatterGroupId") REFERENCES "chatter_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_linkedCampaignId_fkey" FOREIGN KEY ("linkedCampaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_parentReferralId_fkey" FOREIGN KEY ("parentReferralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_users" ADD CONSTRAINT "pre_users_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_tracking" ADD CONSTRAINT "click_tracking_trackingLinkId_fkey" FOREIGN KEY ("trackingLinkId") REFERENCES "tracking_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_tracking" ADD CONSTRAINT "click_tracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_tracking" ADD CONSTRAINT "click_tracking_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatter_groups" ADD CONSTRAINT "chatter_groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_invites" ADD CONSTRAINT "vip_invites_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_invites" ADD CONSTRAINT "vip_invites_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "chatter_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatter_group_members" ADD CONSTRAINT "chatter_group_members_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatter_group_members" ADD CONSTRAINT "chatter_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "chatter_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

