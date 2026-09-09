-- A market name is mutable presentation data. Location remains the immutable market identity.
ALTER TABLE "project_markets" ADD COLUMN "name" TEXT;

UPDATE "project_markets" AS market
SET "name" = COALESCE(NULLIF(btrim(location."displayName"), ''), 'Market ' || market."locationId")
FROM "locations" AS location
WHERE location."id" = market."locationId";

ALTER TABLE "project_markets" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "project_markets" ALTER COLUMN "name" SET DEFAULT 'Market';

ALTER TABLE "project_markets"
ADD COLUMN "futureKeywordDevices" "Device"[] NOT NULL DEFAULT ARRAY['desktop', 'mobile']::"Device"[];
