-- The "global" tracking scope was never consumed by any provider, resolver or
-- the rank-check runner; the location pipeline's minimum granularity is a
-- country. Align the column default and migrate legacy rows.
ALTER TABLE "projects" ALTER COLUMN "trackingScope" SET DEFAULT 'country';
UPDATE "projects" SET "trackingScope" = 'country' WHERE "trackingScope" = 'global';
