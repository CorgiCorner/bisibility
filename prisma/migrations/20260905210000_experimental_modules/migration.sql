ALTER TABLE "project_defaults"
ADD COLUMN "enabledExperimentalModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
