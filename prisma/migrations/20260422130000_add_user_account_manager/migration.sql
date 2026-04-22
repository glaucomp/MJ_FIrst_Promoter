-- Dedicated ownership link so `createdById` can stay immutable creation
-- metadata. See services/ownership.service.ts — resolver reads prefer
-- `accountManagerId` and fall back to `createdById` for legacy rows that
-- predate this column (no destructive backfill).

ALTER TABLE "users"
  ADD COLUMN "accountManagerId" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_accountManagerId_fkey"
  FOREIGN KEY ("accountManagerId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_accountManagerId_idx" ON "users"("accountManagerId");
