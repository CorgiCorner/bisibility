-- Bind all authority functions to the validated deployment-owned schema.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
-- Retained diagnostic fields are not completeness proof. Leave legacy metadata unknown.
ALTER TABLE observation_items
  ADD COLUMN "rankScale" TEXT,
  ADD COLUMN "promotion" TEXT,
  ADD COLUMN "sourcePage" INTEGER,
  ADD COLUMN "sourceBlockId" TEXT,
  ADD COLUMN "sourceOrdinal" INTEGER,
  ADD COLUMN "observedAt" TIMESTAMP(3),
  ADD CONSTRAINT "observation_item_promotion" CHECK ("promotion" IS NULL OR "promotion" IN ('organic','promoted','unknown')),
  ADD CONSTRAINT "observation_item_source_page" CHECK ("sourcePage" IS NULL OR "sourcePage">=1),
  ADD CONSTRAINT "observation_item_source_ordinal" CHECK ("sourceOrdinal" IS NULL OR "sourceOrdinal">=0);
