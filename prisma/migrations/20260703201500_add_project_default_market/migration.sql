-- Add explicit nullable default market fields. NULL means "no explicit default":
-- callers keep deriving from existing keywords, then fall back to US/Desktop.

ALTER TABLE "project_defaults" ADD COLUMN "locationKey" TEXT;
ALTER TABLE "project_defaults" ADD COLUMN "country" TEXT;
ALTER TABLE "project_defaults" ADD COLUMN "city" TEXT;
ALTER TABLE "project_defaults" ADD COLUMN "device" "Device";

CREATE INDEX "project_defaults_locationKey_idx" ON "project_defaults"("locationKey");

ALTER TABLE "project_defaults" ADD CONSTRAINT "project_defaults_locationKey_fkey"
  FOREIGN KEY ("locationKey") REFERENCES "locations"("canonicalKey")
  ON DELETE RESTRICT ON UPDATE CASCADE;
