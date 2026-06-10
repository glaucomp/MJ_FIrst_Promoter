-- Add expiresAt for 2-day invite TTL (from TeaseMe preregister response).
ALTER TABLE "vip_invites" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Replace status enum: pending | in_progress | completed | expired
CREATE TYPE "VipInviteStatus_new" AS ENUM ('pending', 'in_progress', 'completed', 'expired');

ALTER TABLE "vip_invites" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "vip_invites" ALTER COLUMN "status" TYPE "VipInviteStatus_new" USING (
  CASE "status"::text
    WHEN 'profile_completed' THEN 'in_progress'
    WHEN 'verified' THEN 'completed'
    WHEN 'logged_in' THEN 'completed'
    ELSE "status"::text
  END
)::"VipInviteStatus_new";

ALTER TABLE "vip_invites" ALTER COLUMN "status" SET DEFAULT 'pending';

DROP TYPE "VipInviteStatus";
ALTER TYPE "VipInviteStatus_new" RENAME TO "VipInviteStatus";
