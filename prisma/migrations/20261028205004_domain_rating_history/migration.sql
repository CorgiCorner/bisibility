ALTER TABLE "projects" ADD COLUMN "domainRatingEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "domain_rating_checks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "domain" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "version" TEXT NOT NULL DEFAULT 'dr3',
  "source" TEXT NOT NULL,
  "rating" DOUBLE PRECISION,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "domain_rating_checks_rating_range" CHECK ("rating" IS NULL OR ("rating" >= 0 AND "rating" <= 100)),
  CONSTRAINT "domain_rating_checks_source" CHECK ("source" IN ('own', 'hosted'))
);
CREATE UNIQUE INDEX "domain_rating_checks_projectId_domain_day_key" ON "domain_rating_checks"("projectId", "domain", "day");
CREATE INDEX "domain_rating_checks_projectId_domain_day_idx" ON "domain_rating_checks"("projectId", "domain", "day" DESC);
