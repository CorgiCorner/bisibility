-- Project.domain becomes optional: a workspace can exist before the user
-- states which domain bisibility should track. Existing rows are untouched.
ALTER TABLE "projects" ALTER COLUMN "domain" DROP NOT NULL;
