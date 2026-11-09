ALTER TABLE "provider_connections" ADD COLUMN "analyticsDataSyncedAt" TIMESTAMP(3);

-- Historical rows are project/provider scoped, not connection scoped. Conservatively mark
-- the current connection when its project already has stored rows for that provider.
UPDATE "provider_connections" c
SET "analyticsDataSyncedAt" = CURRENT_TIMESTAMP
WHERE c."kind" = 'analytics'
  AND c."provider" IN ('gsc', 'ga4', 'plausible')
  AND (
    EXISTS (SELECT 1 FROM "page_traffic_snapshots" p
            WHERE p."projectId" = c."projectId" AND p."provider" = c."provider")
    OR EXISTS (SELECT 1 FROM "keyword_traffic_snapshots" t
               JOIN "keywords" k ON k."id" = t."keywordId"
               WHERE k."projectId" = c."projectId" AND t."provider" = c."provider")
    OR (c."provider" = 'gsc' AND (
      EXISTS (SELECT 1 FROM "search_analytics_daily" d WHERE d."projectId" = c."projectId")
      OR EXISTS (SELECT 1 FROM "search_analytics_query_daily" d WHERE d."projectId" = c."projectId")
      OR EXISTS (SELECT 1 FROM "search_analytics_page_daily" d WHERE d."projectId" = c."projectId")
      OR EXISTS (SELECT 1 FROM "search_analytics_query_page_daily" d WHERE d."projectId" = c."projectId")
    ))
    OR (c."provider" = 'ga4' AND (
      EXISTS (SELECT 1 FROM "organic_sessions_daily" d WHERE d."projectId" = c."projectId")
      OR EXISTS (SELECT 1 FROM "organic_sessions_page_daily" d WHERE d."projectId" = c."projectId")
    ))
  );
