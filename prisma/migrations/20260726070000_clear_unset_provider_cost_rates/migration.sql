UPDATE "provider_connections"
SET "costPerCheckCents" = NULL
WHERE "costPerCheckCents" = 0
  AND "provider" IN ('dataforseo', 'serpapi');
