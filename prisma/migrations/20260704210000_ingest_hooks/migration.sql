-- CreateTable
CREATE TABLE "ingest_hooks" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_hooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingest_hooks_publicId_key" ON "ingest_hooks"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_hooks_tokenHash_key" ON "ingest_hooks"("tokenHash");

-- CreateIndex
CREATE INDEX "ingest_hooks_projectId_idx" ON "ingest_hooks"("projectId");

-- AddForeignKey
ALTER TABLE "ingest_hooks" ADD CONSTRAINT "ingest_hooks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_hooks" ADD CONSTRAINT "ingest_hooks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
