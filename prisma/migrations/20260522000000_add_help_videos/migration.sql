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

-- CreateIndex
CREATE INDEX "help_videos_userType_isActive_idx" ON "help_videos"("userType", "isActive");
