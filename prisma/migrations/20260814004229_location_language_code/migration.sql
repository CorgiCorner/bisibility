ALTER TABLE "locations" ADD COLUMN "languageCode" TEXT;

UPDATE "locations"
SET "languageCode" = "hl";

ALTER TABLE "locations" ALTER COLUMN "languageCode" SET NOT NULL;
