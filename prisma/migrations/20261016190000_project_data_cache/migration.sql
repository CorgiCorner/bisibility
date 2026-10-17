ALTER TABLE "projects" ADD COLUMN "lookupCacheTtlSeconds" INTEGER;
ALTER TABLE "projects" ADD CONSTRAINT "Project_data_cache_ttl_check" CHECK ("lookupCacheTtlSeconds" IS NULL OR "lookupCacheTtlSeconds" BETWEEN 3600 AND 604800);
ALTER TABLE "agent_reports" ADD COLUMN "cacheReuseUntil" TIMESTAMP(3);
