-- CreateTable
CREATE TABLE "url_presences" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verdict" TEXT,
    "coverageState" TEXT,
    "lastCrawlAt" TIMESTAMP(3),
    "canonicalOk" BOOLEAN,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "url_presences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "url_presences_projectId_url_key" ON "url_presences"("projectId", "url");

-- CreateIndex
CREATE INDEX "url_presences_projectId_checkedAt_idx" ON "url_presences"("projectId", "checkedAt");

-- AddForeignKey
ALTER TABLE "url_presences" ADD CONSTRAINT "url_presences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
