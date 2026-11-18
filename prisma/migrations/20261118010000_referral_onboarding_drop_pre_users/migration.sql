-- Move promoter welcome-email + product onboarding cache onto referrals.
-- Drop pre_users: TeaseMe / Sugar Scratch own pre-user state.

ALTER TABLE "referrals"
  ADD COLUMN IF NOT EXISTS "welcomeEmailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboarding" JSONB,
  ADD COLUMN IF NOT EXISTS "onboardingCheckedAt" TIMESTAMP(3);

-- Copy existing PreUser rows onto their parent Referral (invite-linked first).
UPDATE "referrals" AS r
SET
  "welcomeEmailSentAt" = COALESCE(r."welcomeEmailSentAt", p."welcomeEmailSentAt"),
  "onboardingCheckedAt" = COALESCE(r."onboardingCheckedAt", p."lastCheckedAt"),
  "onboarding" = COALESCE(
    r."onboarding",
    jsonb_build_object(
      'email', to_jsonb(lower(p."email")),
      'currentStep', p."currentStep",
      'status', p."status",
      'surveyLink', to_jsonb(p."surveyLink"),
      'assetLink', to_jsonb(p."assetLink"),
      'teasemeUserId', to_jsonb(p."teasemeUserId"),
      'stepHistory', COALESCE(p."stepHistory", 'null'::jsonb)
    )
  ),
  -- Durable invitee email for legacy rows that never stored metadata.inviteeEmail.
  "metadata" = CASE
    WHEN COALESCE(r."metadata"->>'inviteeEmail', '') = '' AND p."email" IS NOT NULL
      THEN jsonb_set(
        COALESCE(r."metadata", '{}'::jsonb),
        '{inviteeEmail}',
        to_jsonb(lower(p."email")),
        true
      )
    ELSE r."metadata"
  END
FROM "pre_users" AS p
WHERE p."referralId" = r."id";

-- Orphan PreUser rows keyed only by inviteCode.
UPDATE "referrals" AS r
SET
  "welcomeEmailSentAt" = COALESCE(r."welcomeEmailSentAt", p."welcomeEmailSentAt"),
  "onboardingCheckedAt" = COALESCE(r."onboardingCheckedAt", p."lastCheckedAt"),
  "onboarding" = COALESCE(
    r."onboarding",
    jsonb_build_object(
      'email', to_jsonb(lower(p."email")),
      'currentStep', p."currentStep",
      'status', p."status",
      'surveyLink', to_jsonb(p."surveyLink"),
      'assetLink', to_jsonb(p."assetLink"),
      'teasemeUserId', to_jsonb(p."teasemeUserId"),
      'stepHistory', COALESCE(p."stepHistory", 'null'::jsonb)
    )
  ),
  "metadata" = CASE
    WHEN COALESCE(r."metadata"->>'inviteeEmail', '') = '' AND p."email" IS NOT NULL
      THEN jsonb_set(
        COALESCE(r."metadata", '{}'::jsonb),
        '{inviteeEmail}',
        to_jsonb(lower(p."email")),
        true
      )
    ELSE r."metadata"
  END
FROM "pre_users" AS p
WHERE p."referralId" IS NULL
  AND p."inviteCode" IS NOT NULL
  AND p."inviteCode" = r."inviteCode"
  AND r."onboarding" IS NULL;

DROP TABLE IF EXISTS "pre_users";
