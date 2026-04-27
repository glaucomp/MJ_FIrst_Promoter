-- Add survey_link / asset_link columns mirrored from TeaseMe's /step-progress
-- response. surveyLink points to the in-flight onboarding session; assetLink
-- points to the built landing page. Both are nullable until upstream populates.
ALTER TABLE "pre_users"
  ADD COLUMN "surveyLink" TEXT,
  ADD COLUMN "assetLink"  TEXT;
