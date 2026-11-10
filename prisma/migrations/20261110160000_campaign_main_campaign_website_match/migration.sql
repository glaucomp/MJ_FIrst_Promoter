-- Reassign the website source when a hidden campaign that invites into
-- this public campaign actually matches the stored website. The first
-- backfill used the newest hidden campaign and could point at a different site.
UPDATE "campaigns" AS public
SET "mainCampaignId" = chosen.id
FROM (
  SELECT DISTINCT ON (p.id)
    p.id AS public_id,
    h.id
  FROM "campaigns" p
  JOIN "campaigns" h
    ON h."linkedCampaignId" = p.id
   AND h."visibleToPromoters" = false
   AND h.id <> p.id
  WHERE p."visibleToPromoters" = true
    AND h."websiteUrl" = p."websiteUrl"
  ORDER BY
    p.id,
    CASE
      WHEN h."websiteUrl" = p."websiteUrl"
       AND h."defaultReferralUrl" IS NOT DISTINCT FROM p."defaultReferralUrl"
      THEN 0
      WHEN h."websiteUrl" = p."websiteUrl"
      THEN 1
      ELSE 2
    END,
    -- Keep the main already stored when it matches as well as a newer invite.
    CASE WHEN h.id = p."mainCampaignId" THEN 0 ELSE 1 END,
    h."updatedAt" DESC
) AS chosen
WHERE public.id = chosen.public_id
  AND public."mainCampaignId" IS DISTINCT FROM chosen.id
  -- A hidden main that already matches this website is a real choice.
  -- Do not replace it with another inviter that happens to match too.
  AND NOT EXISTS (
    SELECT 1
    FROM "campaigns" current_main
    WHERE current_main.id = public."mainCampaignId"
      AND current_main."visibleToPromoters" = false
      AND current_main."websiteUrl" = public."websiteUrl"
  );

-- Several hidden campaigns invite here and none share this website.
-- Leave the source unset so the next edit cannot copy another site.
UPDATE "campaigns" AS public
SET "mainCampaignId" = NULL
WHERE public."visibleToPromoters" = true
  AND public."mainCampaignId" IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM "campaigns" h
    WHERE h."linkedCampaignId" = public.id
      AND h."visibleToPromoters" = false
      AND h.id <> public.id
  ) > 1
  AND NOT EXISTS (
    SELECT 1
    FROM "campaigns" h
    WHERE h."linkedCampaignId" = public.id
      AND h."visibleToPromoters" = false
      AND h."websiteUrl" = public."websiteUrl"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "campaigns" current_main
    WHERE current_main.id = public."mainCampaignId"
      AND current_main."visibleToPromoters" = false
      AND current_main."websiteUrl" = public."websiteUrl"
  );
