-- CreateEnum
CREATE TYPE "ProjectMarketStatus" AS ENUM ('active', 'paused', 'removed');

-- CreateTable
CREATE TABLE "project_markets" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "ProjectMarketStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_markets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "project_markets"
ADD CONSTRAINT "project_markets_public_id_contract_format"
CHECK ("publicId" ~ '^pmkt_[a-z][a-z0-9]{23}$'::text);

-- CreateIndex
CREATE UNIQUE INDEX "project_markets_publicId_key" ON "project_markets"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "project_markets_projectId_locationId_key" ON "project_markets"("projectId", "locationId");

-- CreateIndex
CREATE INDEX "project_markets_projectId_status_createdAt_id_idx" ON "project_markets"("projectId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "project_markets_locationId_idx" ON "project_markets"("locationId");

-- AddForeignKey
ALTER TABLE "project_markets" ADD CONSTRAINT "project_markets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_markets" ADD CONSTRAINT "project_markets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill active markets from existing keyword locations and configured project defaults.
WITH "market_seeds" AS (
    SELECT DISTINCT "projectId", "locationId"
    FROM "keywords"

    UNION

    SELECT "project_defaults"."projectId", "locations"."id" AS "locationId"
    FROM "project_defaults"
    INNER JOIN "locations" ON "locations"."canonicalKey" = "project_defaults"."locationKey"
    WHERE "project_defaults"."locationKey" IS NOT NULL
)
INSERT INTO "project_markets" ("id", "publicId", "projectId", "locationId", "status", "createdAt", "updatedAt")
SELECT
    'project_market_' || md5("projectId" || ':' || "locationId"),
    'pmkt_a' || substring(md5("projectId" || ':' || "locationId") FROM 1 FOR 23),
    "projectId",
    "locationId",
    'active'::"ProjectMarketStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "market_seeds";
