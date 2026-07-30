-- Granular location EXPAND step: additive & safe, no destructive changes.
-- Introduces a neutral, vendor-free Location catalog (country/region/city) and a
-- nullable foreign key on keywords. The existing scalar geo string column and its
-- uniqueness constraint are intentionally left untouched; the contract/cleanup
-- happens in a later milestone. All provider handles are stored as neutral
-- primary/secondary geo fields.

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('country', 'region', 'city');

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "regionCode" TEXT,
    "cityName" TEXT,
    "gl" TEXT NOT NULL,
    "hl" TEXT NOT NULL,
    "languageLabel" TEXT NOT NULL,
    "primaryGeoCode" INTEGER,
    "primaryGeoName" TEXT NOT NULL,
    "secondaryGeoName" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_canonicalKey_key" ON "locations"("canonicalKey");

-- CreateIndex
CREATE INDEX "locations_countryCode_idx" ON "locations"("countryCode");

-- Seed supported country locations (offline catalog). Ids are stable literals so
-- reruns are deterministic. countryCode/canonicalKey are the ISO alpha-2 code in
-- upper case; displayName/primaryGeoName/secondaryGeoName all carry the country
-- name (country queries use the country name on every provider); primary geo code,
-- region and city are unset at country level.
INSERT INTO "locations" (
    "id", "kind", "displayName", "countryCode", "regionCode", "cityName",
    "gl", "hl", "languageLabel", "primaryGeoCode", "primaryGeoName",
    "secondaryGeoName", "canonicalKey", "createdAt", "updatedAt"
)
VALUES
    ('loc_seed_us', 'country', 'United States', 'US', NULL, NULL, 'us', 'en', 'English', NULL, 'United States', 'United States', 'US', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_gb', 'country', 'United Kingdom', 'GB', NULL, NULL, 'gb', 'en', 'English', NULL, 'United Kingdom', 'United Kingdom', 'GB', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_ca', 'country', 'Canada', 'CA', NULL, NULL, 'ca', 'en', 'English', NULL, 'Canada', 'Canada', 'CA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_au', 'country', 'Australia', 'AU', NULL, NULL, 'au', 'en', 'English', NULL, 'Australia', 'Australia', 'AU', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_de', 'country', 'Germany', 'DE', NULL, NULL, 'de', 'de', 'German', NULL, 'Germany', 'Germany', 'DE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_fr', 'country', 'France', 'FR', NULL, NULL, 'fr', 'fr', 'French', NULL, 'France', 'France', 'FR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_es', 'country', 'Spain', 'ES', NULL, NULL, 'es', 'es', 'Spanish', NULL, 'Spain', 'Spain', 'ES', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_it', 'country', 'Italy', 'IT', NULL, NULL, 'it', 'it', 'Italian', NULL, 'Italy', 'Italy', 'IT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_nl', 'country', 'Netherlands', 'NL', NULL, NULL, 'nl', 'nl', 'Dutch', NULL, 'Netherlands', 'Netherlands', 'NL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_se', 'country', 'Sweden', 'SE', NULL, NULL, 'se', 'sv', 'Swedish', NULL, 'Sweden', 'Sweden', 'SE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_pl', 'country', 'Poland', 'PL', NULL, NULL, 'pl', 'pl', 'Polish', NULL, 'Poland', 'Poland', 'PL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_ie', 'country', 'Ireland', 'IE', NULL, NULL, 'ie', 'en', 'English', NULL, 'Ireland', 'Ireland', 'IE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_pt', 'country', 'Portugal', 'PT', NULL, NULL, 'pt', 'pt', 'Portuguese', NULL, 'Portugal', 'Portugal', 'PT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_be', 'country', 'Belgium', 'BE', NULL, NULL, 'be', 'nl', 'Dutch', NULL, 'Belgium', 'Belgium', 'BE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_ch', 'country', 'Switzerland', 'CH', NULL, NULL, 'ch', 'de', 'German', NULL, 'Switzerland', 'Switzerland', 'CH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_at', 'country', 'Austria', 'AT', NULL, NULL, 'at', 'de', 'German', NULL, 'Austria', 'Austria', 'AT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_dk', 'country', 'Denmark', 'DK', NULL, NULL, 'dk', 'da', 'Danish', NULL, 'Denmark', 'Denmark', 'DK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_no', 'country', 'Norway', 'NO', NULL, NULL, 'no', 'no', 'Norwegian', NULL, 'Norway', 'Norway', 'NO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_fi', 'country', 'Finland', 'FI', NULL, NULL, 'fi', 'fi', 'Finnish', NULL, 'Finland', 'Finland', 'FI', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_br', 'country', 'Brazil', 'BR', NULL, NULL, 'br', 'pt', 'Portuguese', NULL, 'Brazil', 'Brazil', 'BR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_mx', 'country', 'Mexico', 'MX', NULL, NULL, 'mx', 'es', 'Spanish', NULL, 'Mexico', 'Mexico', 'MX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_in', 'country', 'India', 'IN', NULL, NULL, 'in', 'en', 'English', NULL, 'India', 'India', 'IN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_jp', 'country', 'Japan', 'JP', NULL, NULL, 'jp', 'ja', 'Japanese', NULL, 'Japan', 'Japan', 'JP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_sg', 'country', 'Singapore', 'SG', NULL, NULL, 'sg', 'en', 'English', NULL, 'Singapore', 'Singapore', 'SG', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_nz', 'country', 'New Zealand', 'NZ', NULL, NULL, 'nz', 'en', 'English', NULL, 'New Zealand', 'New Zealand', 'NZ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_za', 'country', 'South Africa', 'ZA', NULL, NULL, 'za', 'en', 'English', NULL, 'South Africa', 'South Africa', 'ZA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('loc_seed_ae', 'country', 'United Arab Emirates', 'AE', NULL, NULL, 'ae', 'en', 'English', NULL, 'United Arab Emirates', 'United Arab Emirates', 'AE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "keywords" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE INDEX "keywords_locationId_idx" ON "keywords"("locationId");

-- Backfill keywords.locationId from the seeded country catalog. keywords.location
-- may be a canonical country name or a legacy/free-form alias; it is mapped
-- (case/space-insensitive) through the same alias table used by the prior
-- normalize migration to a canonical country name, then to the seeded row via
-- displayName. Anything that does not resolve degrades to the default country
-- (United States), matching the runtime behavior, so the backfill itself leaves
-- no row NULL. The mapping is deterministic per location string, so keywords
-- sharing a location string share a locationId. (The dedup guard below then
-- deliberately resets duplicate losers' locationId back to NULL to protect the
-- future unique index; the contract migration resolves those before SET NOT NULL.)
WITH market_aliases("alias", "canonical") AS (
  VALUES
    ('United States', 'United States'),
    ('US', 'United States'),
    ('USA', 'United States'),
    ('United States of America', 'United States'),
    ('Global', 'United States'),
    ('United Kingdom', 'United Kingdom'),
    ('GB', 'United Kingdom'),
    ('UK', 'United Kingdom'),
    ('Great Britain', 'United Kingdom'),
    ('Canada', 'Canada'),
    ('CA', 'Canada'),
    ('Australia', 'Australia'),
    ('AU', 'Australia'),
    ('Germany', 'Germany'),
    ('DE', 'Germany'),
    ('Deutschland', 'Germany'),
    ('France', 'France'),
    ('FR', 'France'),
    ('Spain', 'Spain'),
    ('ES', 'Spain'),
    ('Espana', 'Spain'),
    ('España', 'Spain'),
    ('Italy', 'Italy'),
    ('IT', 'Italy'),
    ('Italia', 'Italy'),
    ('Netherlands', 'Netherlands'),
    ('NL', 'Netherlands'),
    ('Holland', 'Netherlands'),
    ('Sweden', 'Sweden'),
    ('SE', 'Sweden'),
    ('Poland', 'Poland'),
    ('PL', 'Poland'),
    ('Polska', 'Poland'),
    ('Ireland', 'Ireland'),
    ('IE', 'Ireland'),
    ('Portugal', 'Portugal'),
    ('PT', 'Portugal'),
    ('Belgium', 'Belgium'),
    ('BE', 'Belgium'),
    ('Switzerland', 'Switzerland'),
    ('CH', 'Switzerland'),
    ('Austria', 'Austria'),
    ('AT', 'Austria'),
    ('Denmark', 'Denmark'),
    ('DK', 'Denmark'),
    ('Norway', 'Norway'),
    ('NO', 'Norway'),
    ('Finland', 'Finland'),
    ('FI', 'Finland'),
    ('Brazil', 'Brazil'),
    ('BR', 'Brazil'),
    ('Mexico', 'Mexico'),
    ('MX', 'Mexico'),
    ('India', 'India'),
    ('IN', 'India'),
    ('Japan', 'Japan'),
    ('JP', 'Japan'),
    ('Singapore', 'Singapore'),
    ('SG', 'Singapore'),
    ('New Zealand', 'New Zealand'),
    ('NZ', 'New Zealand'),
    ('South Africa', 'South Africa'),
    ('ZA', 'South Africa'),
    ('United Arab Emirates', 'United Arab Emirates'),
    ('AE', 'United Arab Emirates'),
    ('UAE', 'United Arab Emirates')
),
default_location AS (
  SELECT "id" FROM "locations" WHERE "canonicalKey" = 'US'
),
resolved AS (
  SELECT
    keyword."id" AS "keywordId",
    COALESCE(
      matched_location."id",
      (SELECT "id" FROM default_location)
    ) AS "locationId"
  FROM "keywords" AS keyword
  LEFT JOIN market_aliases
    ON lower(trim(keyword."location")) = lower(trim(market_aliases."alias"))
  LEFT JOIN "locations" AS matched_location
    ON matched_location."kind" = 'country'
    AND matched_location."displayName" = market_aliases."canonical"
)
UPDATE "keywords" AS keyword
SET
  "locationId" = resolved."locationId",
  "updatedAt" = CURRENT_TIMESTAMP
FROM resolved
WHERE keyword."id" = resolved."keywordId";

-- Dedup guard: distinct legacy location strings can collapse to the same
-- locationId, which would violate the FUTURE unique index
-- (projectId, text, locationId, device) introduced in a later milestone. Mirror
-- the safe-candidate / NOT EXISTS guard from the normalize migration: within each
-- (projectId, text, locationId, device) group keep only the oldest keyword's
-- locationId and reset the newer duplicates back to NULL so the future unique
-- index cannot fail. Newer rows keep their readable scalar location string; only
-- the redundant foreign key is cleared.
WITH duplicate_locations AS (
  SELECT candidate."id"
  FROM "keywords" AS candidate
  WHERE candidate."locationId" IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "keywords" AS keeper
      WHERE keeper."id" <> candidate."id"
        AND keeper."locationId" IS NOT NULL
        AND keeper."projectId" = candidate."projectId"
        AND keeper."text" = candidate."text"
        AND keeper."device" = candidate."device"
        AND keeper."locationId" = candidate."locationId"
        AND (
          keeper."createdAt" < candidate."createdAt"
          OR (keeper."createdAt" = candidate."createdAt" AND keeper."id" < candidate."id")
        )
    )
)
UPDATE "keywords" AS keyword
SET
  "locationId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM duplicate_locations
WHERE keyword."id" = duplicate_locations."id";

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
