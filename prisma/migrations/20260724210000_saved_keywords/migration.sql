-- AlterTable
ALTER TABLE "cloud_import_jobs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "saved_keywords" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "volume" INTEGER,
    "difficulty" INTEGER,
    "cpc" DOUBLE PRECISION,
    "intent" TEXT,
    "trend" JSONB,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "sourceSeed" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_keywords_publicId_key" ON "saved_keywords"("publicId");

-- CreateIndex
CREATE INDEX "saved_keywords_projectId_savedAt_idx" ON "saved_keywords"("projectId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_keywords_projectId_normalizedText_location_key" ON "saved_keywords"("projectId", "normalizedText", "location");

-- AddForeignKey
ALTER TABLE "saved_keywords" ADD CONSTRAINT "saved_keywords_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
