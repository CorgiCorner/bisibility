-- CreateTable
CREATE TABLE "schedule_review_receipts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "actorId" TEXT,
    "revision" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_review_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_review_receipts_tokenHash_key" ON "schedule_review_receipts"("tokenHash");

-- CreateIndex
CREATE INDEX "schedule_review_receipts_projectId_idx" ON "schedule_review_receipts"("projectId");

-- CreateIndex
CREATE INDEX "schedule_review_receipts_createdAt_idx" ON "schedule_review_receipts"("createdAt");

-- AddForeignKey
ALTER TABLE "schedule_review_receipts" ADD CONSTRAINT "schedule_review_receipts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_review_receipts" ADD CONSTRAINT "schedule_review_receipts_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
