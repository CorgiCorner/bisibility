-- CreateTable
CREATE TABLE "keyword_research_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "normalizedSeed" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "includeClickstream" BOOLEAN NOT NULL,
    "resultLimit" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "freshUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_research_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_research_snapshots_projectId_requestKey_key" ON "keyword_research_snapshots"("projectId", "requestKey");

-- AddForeignKey
ALTER TABLE "keyword_research_snapshots" ADD CONSTRAINT "keyword_research_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
