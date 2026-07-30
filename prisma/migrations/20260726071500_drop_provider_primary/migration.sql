WITH "ranked_connections" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId", "kind"
      ORDER BY "isPrimary" DESC, "priority" ASC, "provider" ASC
    ) - 1 AS "nextPriority"
  FROM "provider_connections"
)
UPDATE "provider_connections" AS "connection"
SET "priority" = "ranked"."nextPriority"
FROM "ranked_connections" AS "ranked"
WHERE "connection"."id" = "ranked"."id";

ALTER TABLE "provider_connections" DROP COLUMN "isPrimary";
