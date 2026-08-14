-- Saved research rows keep their canonical country-language pair explicitly.
ALTER TABLE "saved_keywords"
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "languageCode" TEXT;

-- Historical saved-keyword inputs were syntax-checked but did not materialize a
-- Location row. Preserve those rows by deriving their pair from the canonical
-- key. An exact Location remains authoritative, an explicit suffix comes next,
-- then the product's historical country default. Unsupported legacy country
-- keys use `und` instead of aborting the whole deployment.
WITH "product_defaults"("countryCode", "languageCode") AS (
    VALUES
        ('AE', 'en'), ('AT', 'de'), ('AU', 'en'), ('BE', 'nl'), ('BR', 'pt'),
        ('CA', 'en'), ('CH', 'de'), ('DE', 'de'), ('DK', 'da'), ('ES', 'es'),
        ('FI', 'fi'), ('FR', 'fr'), ('GB', 'en'), ('IE', 'en'), ('IN', 'en'),
        ('IT', 'it'), ('JP', 'ja'), ('MX', 'es'), ('NL', 'nl'), ('NO', 'no'),
        ('NZ', 'en'), ('PL', 'pl'), ('PT', 'pt'), ('SE', 'sv'), ('SG', 'en'),
        ('US', 'en'), ('ZA', 'en')
),
"backfill" AS (
    SELECT
        saved."id",
        COALESCE(
            location."countryCode",
            UPPER(SPLIT_PART(SPLIT_PART(saved."location", '@', 1), '/', 1))
        ) AS "countryCode",
        COALESCE(
            location."languageCode",
            NULLIF(LOWER(SPLIT_PART(saved."location", '@', 2)), ''),
            defaults."languageCode",
            'und'
        ) AS "languageCode"
    FROM "saved_keywords" AS saved
    LEFT JOIN "locations" AS location
        ON location."canonicalKey" = saved."location"
    LEFT JOIN "product_defaults" AS defaults
        ON defaults."countryCode" = UPPER(SPLIT_PART(SPLIT_PART(saved."location", '@', 1), '/', 1))
)
UPDATE "saved_keywords" AS saved
SET
    "countryCode" = backfill."countryCode",
    "languageCode" = backfill."languageCode"
FROM "backfill"
WHERE backfill."id" = saved."id";

ALTER TABLE "saved_keywords"
ALTER COLUMN "countryCode" SET NOT NULL,
ALTER COLUMN "languageCode" SET NOT NULL;

DROP INDEX "saved_keywords_projectId_normalizedText_location_key";

CREATE UNIQUE INDEX "saved_keywords_market_pair_key"
ON "saved_keywords"("projectId", "normalizedText", "location", "countryCode", "languageCode");
