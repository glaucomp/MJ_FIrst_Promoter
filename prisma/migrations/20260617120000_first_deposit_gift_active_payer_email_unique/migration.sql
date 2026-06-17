-- Collapse duplicate active gifts per payer (keep newest) before adding the constraint.
DELETE FROM "first_deposit_gifts" AS fdg
WHERE fdg."status" IN ('INVITED', 'PENDING', 'SENT', 'ACCEPTED')
  AND fdg."payerEmail" IS NOT NULL
  AND fdg."id" NOT IN (
    SELECT DISTINCT ON (LOWER("payerEmail")) "id"
    FROM "first_deposit_gifts"
    WHERE "status" IN ('INVITED', 'PENDING', 'SENT', 'ACCEPTED')
      AND "payerEmail" IS NOT NULL
    ORDER BY LOWER("payerEmail"), "createdAt" DESC
  );

-- At most one active gift per payer email (case-insensitive). EXPIRED rows are
-- excluded so a fresh code may be issued after expiry.
CREATE UNIQUE INDEX "first_deposit_gifts_payer_email_active_key"
ON "first_deposit_gifts" (LOWER("payerEmail"))
WHERE "status" IN ('INVITED', 'PENDING', 'SENT', 'ACCEPTED') AND "payerEmail" IS NOT NULL;
