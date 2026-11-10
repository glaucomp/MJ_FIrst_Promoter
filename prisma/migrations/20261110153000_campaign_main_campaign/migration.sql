-- Public campaigns record which hidden campaign supplies their website.
ALTER TABLE "campaigns" ADD COLUMN "mainCampaignId" TEXT;

-- Existing public campaigns: the most recently updated hidden campaign
-- that already points here is the website source.
UPDATE "campaigns" AS public
SET "mainCampaignId" = (
  SELECT hidden.id
  FROM "campaigns" AS hidden
  WHERE hidden."linkedCampaignId" = public.id
    AND hidden."visibleToPromoters" = false
    AND hidden.id <> public.id
  ORDER BY hidden."updatedAt" DESC
  LIMIT 1
)
WHERE public."visibleToPromoters" = true
  AND public."mainCampaignId" IS NULL;

CREATE INDEX "campaigns_mainCampaignId_idx" ON "campaigns"("mainCampaignId");

ALTER TABLE "campaigns"
ADD CONSTRAINT "campaigns_mainCampaignId_fkey"
FOREIGN KEY ("mainCampaignId") REFERENCES "campaigns"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
