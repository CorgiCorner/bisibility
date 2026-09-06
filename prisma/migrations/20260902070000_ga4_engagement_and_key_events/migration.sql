ALTER TABLE "organic_sessions_page_daily" ADD COLUMN "engagedSessions" INTEGER;
ALTER TABLE "organic_sessions_page_daily" ADD COLUMN "keyEvents" INTEGER;
ALTER TABLE "search_analytics_imports" ADD COLUMN "keyEventsConfigured" BOOLEAN;
ALTER TABLE "search_analytics_imports" ADD COLUMN "keyEventsCheckedAt" TIMESTAMP(3);
