-- Add mustChangePassword to users: set for accounts created via the TeaseMe
-- 4→5 promotion flow (temp-password login). Existing rows default to false
-- (no change required — they already have their own credentials).
ALTER TABLE "users"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- Add welcomeEmailSentAt to pre_users: stamped once the welcome email has
-- been successfully delivered for a promoted pre-user. Null = not yet sent
-- (or a transient failure that will be retried on the next poll). Existing
-- rows default to null (no backfill needed; they haven't been promoted yet).
ALTER TABLE "pre_users"
  ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);
