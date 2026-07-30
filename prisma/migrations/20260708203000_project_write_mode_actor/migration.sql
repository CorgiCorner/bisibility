UPDATE "projects"
SET "writeModeChangedById" = NULL
WHERE "writeModeChangedById" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "users"
    WHERE "users"."id" = "projects"."writeModeChangedById"
  );

CREATE INDEX "projects_writeModeChangedById_idx"
ON "projects"("writeModeChangedById");

ALTER TABLE "projects"
ADD CONSTRAINT "projects_writeModeChangedById_fkey"
FOREIGN KEY ("writeModeChangedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
