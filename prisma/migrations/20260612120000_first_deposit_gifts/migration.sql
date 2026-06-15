-- CreateEnum
CREATE TYPE "FirstDepositGiftStatus" AS ENUM ('INVITED', 'PENDING', 'SENT', 'ACCEPTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "first_deposit_gifts" (
    "id" TEXT NOT NULL,
    "promoCode" TEXT NOT NULL,
    "payerEmail" TEXT,
    "payerName" TEXT,
    "transactionRef" TEXT,
    "depositCents" INTEGER,
    "status" "FirstDepositGiftStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "first_deposit_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "first_deposit_gifts_promoCode_key" ON "first_deposit_gifts"("promoCode");

-- CreateIndex
CREATE INDEX "first_deposit_gifts_status_idx" ON "first_deposit_gifts"("status");

-- CreateIndex
CREATE INDEX "first_deposit_gifts_payerEmail_idx" ON "first_deposit_gifts"("payerEmail");
