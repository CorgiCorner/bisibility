ALTER TABLE "projects" DROP CONSTRAINT "Project_data_cache_ttl_check";
ALTER TABLE "projects" ADD CONSTRAINT "Project_data_cache_ttl_check" CHECK (
  "lookupCacheTtlSeconds" IS NULL
  OR "lookupCacheTtlSeconds" BETWEEN 3600 AND 2592000
);
