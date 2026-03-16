-- AlterTable
ALTER TABLE "commissions" ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE INDEX "commissions_customerId_idx" ON "commissions"("customerId");

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
