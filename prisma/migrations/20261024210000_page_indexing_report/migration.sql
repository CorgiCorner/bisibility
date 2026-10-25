-- CreateEnum
CREATE TYPE "InspectionBudgetMode" AS ENUM ('off', 'fixed', 'available_quota');

-- CreateEnum
CREATE TYPE "UrlPresenceSource" AS ENUM ('keyword_target', 'sitemap', 'manual');

-- AlterTable
ALTER TABLE "project_defaults" ADD COLUMN     "indexingDiscoveryAt" TIMESTAMP(3),
ADD COLUMN     "indexingDiscoveryComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inspectionBudgetMode" "InspectionBudgetMode" NOT NULL DEFAULT 'fixed';

-- AlterTable
ALTER TABLE "url_presences" ADD COLUMN     "crawledAs" TEXT,
ADD COLUMN     "fullInspectionRecorded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleCanonical" TEXT,
ADD COLUMN     "indexingState" TEXT,
ADD COLUMN     "inspectionError" TEXT,
ADD COLUMN     "inspectionFailedAt" TIMESTAMP(3),
ADD COLUMN     "inspectionResultLink" TEXT,
ADD COLUMN     "lastListedAt" TIMESTAMP(3),
ADD COLUMN     "pageFetchState" TEXT,
ADD COLUMN     "referringUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "richResultsSummary" JSONB,
ADD COLUMN     "robotsTxtState" TEXT,
ADD COLUMN     "sitemapUrl" TEXT,
ADD COLUMN     "sitemaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source" "UrlPresenceSource" NOT NULL DEFAULT 'keyword_target',
ADD COLUMN     "userCanonical" TEXT,
ALTER COLUMN "checkedAt" DROP NOT NULL,
ALTER COLUMN "checkedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "url_presence_changes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous" JSONB NOT NULL,
    "next" JSONB NOT NULL,

    CONSTRAINT "url_presence_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_property_quotas" (
    "accountKey" TEXT NOT NULL,
    "pacificDate" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "last429Kind" TEXT,
    "last429At" TIMESTAMP(3),
    "resetAt" TIMESTAMP(3),
    "dailyStoppedUntil" TIMESTAMP(3),

    CONSTRAINT "inspection_property_quotas_pkey" PRIMARY KEY ("accountKey")
);

-- CreateIndex
CREATE INDEX "url_presence_changes_projectId_url_at_idx" ON "url_presence_changes"("projectId", "url", "at" DESC);

-- CreateIndex
CREATE INDEX "url_presence_changes_projectId_at_idx" ON "url_presence_changes"("projectId", "at" DESC);

-- AddForeignKey
ALTER TABLE "url_presence_changes" ADD CONSTRAINT "url_presence_changes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accept the new budget mode while retaining pre-feature receipts unchanged.
CREATE OR REPLACE FUNCTION measurement_settings_defaults_result_valid(v jsonb, source_hash text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    jsonb_typeof(v)='object' AND octet_length(v::text)<=8192
    AND v ?& ARRAY['revision','sourceHash','value','market','timestamps']
    AND v-ARRAY['revision','sourceHash','value','market','timestamps']='{}'::jsonb
    AND jsonb_typeof(v->'sourceHash')='string' AND v->>'sourceHash'=source_hash
    AND CASE WHEN jsonb_typeof(v->'revision')='string' AND v->>'revision' ~ '^(0|[1-9][0-9]{0,18})$'
      THEN (v->>'revision')::numeric<=9223372036854775807 ELSE FALSE END
    AND jsonb_typeof(v->'value')='object'
    AND (v->'value') ?& ARRAY['projectId','city','country','device','locationKey','frequency','cronExpression',
      'timezone','jitterMinutes','serpDepth','serpStopOnMatch','inspectionDailyLimit','searchSyncImportMonths','searchSyncPace']
    AND (v->'value')-ARRAY['projectId','city','country','device','locationKey','frequency','cronExpression',
      'timezone','jitterMinutes','serpDepth','serpStopOnMatch','inspectionDailyLimit','inspectionBudgetMode','searchSyncImportMonths','searchSyncPace']='{}'::jsonb
    AND (NOT (v->'value' ? 'inspectionBudgetMode') OR
      (jsonb_typeof(v->'value'->'inspectionBudgetMode')='string' AND
        v->'value'->>'inspectionBudgetMode' IN ('off','fixed','available_quota')))
    AND jsonb_typeof(v->'value'->'projectId')='string'
    AND length(v->'value'->>'projectId') BETWEEN 1 AND 120
    AND jsonb_typeof(v->'value'->'city') IN ('string','null')
    AND jsonb_typeof(v->'value'->'country') IN ('string','null')
    AND (v->'value'->'device'='null'::jsonb OR v->'value'->>'device' IN ('desktop','mobile'))
    AND jsonb_typeof(v->'value'->'locationKey') IN ('string','null')
    AND v->'value'->>'frequency' IN ('daily','weekly','monthly','manual','paused','custom_cron')
    AND jsonb_typeof(v->'value'->'cronExpression') IN ('string','null')
    AND jsonb_typeof(v->'value'->'timezone')='string'
    AND CASE WHEN jsonb_typeof(v->'value'->'jitterMinutes')='number' THEN
      (v->'value'->>'jitterMinutes')::numeric=trunc((v->'value'->>'jitterMinutes')::numeric) ELSE FALSE END
    AND jsonb_typeof(v->'value'->'serpDepth')='number' AND v->'value'->>'serpDepth' IN ('10','20','50','100')
    AND jsonb_typeof(v->'value'->'serpStopOnMatch')='boolean'
    AND CASE WHEN jsonb_typeof(v->'value'->'inspectionDailyLimit')='number' THEN
      (v->'value'->>'inspectionDailyLimit')::numeric=trunc((v->'value'->>'inspectionDailyLimit')::numeric) ELSE FALSE END
    AND CASE WHEN v->'value'->'searchSyncImportMonths'='null'::jsonb THEN TRUE
      WHEN jsonb_typeof(v->'value'->'searchSyncImportMonths')='number' THEN
      (v->'value'->>'searchSyncImportMonths')::numeric=trunc((v->'value'->>'searchSyncImportMonths')::numeric) ELSE FALSE END
    AND jsonb_typeof(v->'value'->'searchSyncPace') IN ('string','null')
    AND jsonb_typeof(v->'market')='object'
    AND (v->'market') ?& ARRAY['city','country','device','locationKey','source']
    AND (v->'market')-ARRAY['city','country','device','locationKey','source']='{}'::jsonb
    AND jsonb_typeof(v->'market'->'city') IN ('string','null')
    AND jsonb_typeof(v->'market'->'country')='string'
    AND v->'market'->>'device' IN ('desktop','mobile')
    AND jsonb_typeof(v->'market'->'locationKey')='string'
    AND v->'market'->>'source' IN ('explicit','derived','fallback')
    AND jsonb_typeof(v->'timestamps')='object'
    AND (v->'timestamps') ?& ARRAY['lastCheckedAt','nextCheckAt','updatedAt']
    AND (v->'timestamps')-ARRAY['lastCheckedAt','nextCheckAt','updatedAt']='{}'::jsonb
    AND jsonb_typeof(v->'timestamps'->'lastCheckedAt') IN ('string','null')
    AND jsonb_typeof(v->'timestamps'->'nextCheckAt') IN ('string','null')
    AND jsonb_typeof(v->'timestamps'->'updatedAt')='string', FALSE);
$$;
