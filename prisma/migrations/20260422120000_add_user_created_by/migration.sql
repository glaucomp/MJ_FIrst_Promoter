-- Track who created each user. Primary use-case: scope chatters to the
-- account manager who created them so one AM can't see another AM's chatters.

ALTER TABLE "users"
  ADD COLUMN "createdById" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_createdById_idx" ON "users"("createdById");

-- Best-effort backfill for existing chatters: infer the "owner" as the
-- creator of the earliest group the chatter was assigned to. Chatters not
-- yet in any group remain NULL and will be picked up on first create/assign.
WITH first_membership AS (
  SELECT DISTINCT ON (m."chatterId")
    m."chatterId" AS chatter_id,
    g."createdById" AS owner_id
  FROM "chatter_group_members" m
  JOIN "chatter_groups" g ON g."id" = m."groupId"
  ORDER BY m."chatterId", m."assignedAt" ASC
)
UPDATE "users" u
SET "createdById" = fm.owner_id
FROM first_membership fm
WHERE u."id" = fm.chatter_id
  AND u."userType" = 'CHATTER'
  AND u."createdById" IS NULL;
