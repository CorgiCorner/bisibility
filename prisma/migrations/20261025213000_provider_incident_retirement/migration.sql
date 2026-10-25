ALTER TABLE "projects" ADD COLUMN "providerIncidentsRetiredThrough" TIMESTAMP(3);
ALTER TABLE "provider_incidents" ADD COLUMN "retiredAt" TIMESTAMP(3);

-- Already retired copies keep their old operations and incident history silent.
UPDATE "projects"
SET "providerIncidentsRetiredThrough" = GREATEST("writeModeChangedAt", clock_timestamp())
WHERE "writeMode" = 'migrated';
UPDATE "provider_incidents" AS i
SET "retiredAt" = p."providerIncidentsRetiredThrough",
    "state" = 'resolved', "openSlot" = NULL,
    "resolvedAt" = COALESCE(i."resolvedAt", p."providerIncidentsRetiredThrough")
FROM "projects" AS p
WHERE i."projectId" = p.id AND p."providerIncidentsRetiredThrough" IS NOT NULL;
DELETE FROM "notifications" AS n USING "projects" AS p
WHERE n."projectId" = p.id AND n.type = 'provider_incident'
  AND p."providerIncidentsRetiredThrough" IS NOT NULL;

DROP INDEX "provider_incidents_project_cause";
CREATE UNIQUE INDEX "provider_incidents_project_cause_current"
ON "provider_incidents" ("projectId", "cause") WHERE "retiredAt" IS NULL;
