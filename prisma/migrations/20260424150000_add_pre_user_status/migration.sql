-- Add lifecycle status column to pre_users, mirrored from TeaseMe's
-- /step-progress response (pending -> order_lp -> building -> live).
ALTER TABLE "pre_users"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
