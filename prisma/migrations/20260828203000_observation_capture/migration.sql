-- CreateTable
CREATE TABLE "observation_runs" (
    "id" TEXT NOT NULL,
    "rankCheckId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "requestPolicy" JSONB NOT NULL,
    "completeness" TEXT NOT NULL,
    "configuredScope" JSONB NOT NULL,
    "effectiveScope" JSONB,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation_items" (
    "id" TEXT NOT NULL,
    "observationRunId" TEXT NOT NULL,
    "resultKind" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "rankGroup" INTEGER,
    "rankAbsolute" INTEGER,
    "blockPosition" INTEGER,
    "positionInBlock" INTEGER,
    "title" TEXT,
    "url" TEXT,
    "domain" TEXT,
    "businessName" TEXT,
    "placeId" TEXT,
    "cid" TEXT,
    "mapsUrl" TEXT,
    "rating" JSONB,
    "rawFragment" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "observation_runs_rankCheckId_key" ON "observation_runs"("rankCheckId");

-- CreateIndex
CREATE INDEX "observation_runs_projectId_executedAt_idx" ON "observation_runs"("projectId", "executedAt" DESC);

-- CreateIndex
CREATE INDEX "observation_items_observationRunId_resultKind_idx" ON "observation_items"("observationRunId", "resultKind");

-- AddForeignKey
ALTER TABLE "observation_runs" ADD CONSTRAINT "observation_runs_rankCheckId_fkey" FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_runs" ADD CONSTRAINT "observation_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_items" ADD CONSTRAINT "observation_items_observationRunId_fkey" FOREIGN KEY ("observationRunId") REFERENCES "observation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

