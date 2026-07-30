CREATE TYPE "ProjectWriteMode" AS ENUM ('active', 'migration_hold');

ALTER TABLE "projects"
  ADD COLUMN "writeMode" "ProjectWriteMode" NOT NULL DEFAULT 'active',
  ADD COLUMN "writeModeChangedAt" TIMESTAMP(3),
  ADD COLUMN "writeModeChangedById" TEXT;
