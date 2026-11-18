-- Repair already-migrated referrals that lost PreUser.email when onboarding
-- was copied without an email field. Prefer metadata.inviteeEmail when present;
-- also copy onboarding.email back into metadata for rows that already have it.

-- 1) onboarding.email <- metadata.inviteeEmail when missing
UPDATE "referrals"
SET "onboarding" = jsonb_set(
  COALESCE("onboarding", '{}'::jsonb),
  '{email}',
  to_jsonb(lower(trim("metadata"->>'inviteeEmail'))),
  true
)
WHERE "onboarding" IS NOT NULL
  AND COALESCE(trim("onboarding"->>'email'), '') = ''
  AND COALESCE(trim("metadata"->>'inviteeEmail'), '') <> '';

-- 2) metadata.inviteeEmail <- onboarding.email when missing
UPDATE "referrals"
SET "metadata" = jsonb_set(
  COALESCE("metadata", '{}'::jsonb),
  '{inviteeEmail}',
  to_jsonb(lower(trim("onboarding"->>'email'))),
  true
)
WHERE COALESCE(trim("onboarding"->>'email'), '') <> ''
  AND COALESCE(trim("metadata"->>'inviteeEmail'), '') = '';
