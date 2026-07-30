-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'auditor';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "sourceIpHash" TEXT,
ADD COLUMN     "sourceIpMasked" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'success',
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
