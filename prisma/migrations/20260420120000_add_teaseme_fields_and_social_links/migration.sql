-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "voiceId" TEXT,
  ADD COLUMN "profilePhotoKey" TEXT,
  ADD COLUMN "profileVideoKey" TEXT,
  ADD COLUMN "teasemeSyncedAt" TIMESTAMP(3);

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

-- CreateIndex
CREATE INDEX "social_links_userId_idx" ON "social_links"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "social_links_userId_platform_key" ON "social_links"("userId", "platform");

-- AddForeignKey
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
