-- Company mailbox used to send promoter invites. Password emails stay on SES.
-- IF NOT EXISTS covers databases that already have fromEmail/fromName.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mailHost" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mailPort" INTEGER DEFAULT 587;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mailUser" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mailPassword" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "fromName" TEXT;
