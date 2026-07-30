ALTER TABLE "cloud_import_jobs"
ADD COLUMN "chunkCount" INTEGER,
ADD COLUMN "chunksReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "chunksImported" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "manifest" JSONB;

CREATE TABLE "migration_import_chunks" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedAt" TIMESTAMP(3),

  CONSTRAINT "migration_import_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "migration_import_chunks_jobId_index_key"
ON "migration_import_chunks"("jobId", "index");

CREATE INDEX "migration_import_chunks_jobId_idx"
ON "migration_import_chunks"("jobId");

ALTER TABLE "migration_import_chunks"
ADD CONSTRAINT "migration_import_chunks_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "cloud_import_jobs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
