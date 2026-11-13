-- CreateTable
CREATE TABLE "search_engine_updates" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "beginsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "uri" TEXT NOT NULL,
    "modifiedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_engine_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_engine_updates_externalId_key" ON "search_engine_updates"("externalId");

-- CreateIndex
CREATE INDEX "search_engine_updates_engine_beginsAt_idx" ON "search_engine_updates"("engine", "beginsAt");
