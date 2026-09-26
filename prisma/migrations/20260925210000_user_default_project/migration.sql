ALTER TABLE "users"
  ADD COLUMN "defaultProjectId" TEXT;

CREATE INDEX "users_defaultProjectId_idx"
  ON "users"("defaultProjectId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_defaultProjectId_fkey"
  FOREIGN KEY ("defaultProjectId") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
