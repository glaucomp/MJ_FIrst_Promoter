-- "aws" sends promoter invites through this app's Amazon SES account.
-- "smtp" uses the company mailbox on the same row.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mailProvider" TEXT NOT NULL DEFAULT 'smtp';
