-- Keep one non-EXPIRED gift per payer (case-insensitive). Expire older duplicates
-- before adding the constraint so existing data cannot block deployment.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER("payerEmail")
      ORDER BY "createdAt" DESC
    ) AS rn
  FROM "first_deposit_gifts"
  WHERE "payerEmail" IS NOT NULL
    AND status <> 'EXPIRED'
)
UPDATE "first_deposit_gifts" AS g
SET status = 'EXPIRED', "updatedAt" = CURRENT_TIMESTAMP
FROM ranked AS r
WHERE g.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX "first_deposit_gifts_payerEmail_active_key"
ON "first_deposit_gifts" (LOWER("payerEmail"))
WHERE "payerEmail" IS NOT NULL AND status <> 'EXPIRED';
