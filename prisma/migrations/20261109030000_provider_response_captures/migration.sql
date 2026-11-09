CREATE TABLE "provider_response_captures" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "connectionId" TEXT,
  "provider" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "operationId" TEXT,
  "attemptId" TEXT,
  "httpStatus" INTEGER NOT NULL,
  "requestUrl" TEXT,
  "payloadEncrypted" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payloadBytes" INTEGER NOT NULL,
  "encoding" TEXT NOT NULL DEFAULT 'gzip-json-v1',
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "provider_response_captures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_response_captures_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "provider_response_captures_projectId_capturedAt_idx" ON "provider_response_captures"("projectId", "capturedAt");
CREATE INDEX "provider_response_captures_projectId_operationId_idx" ON "provider_response_captures"("projectId", "operationId");
CREATE INDEX "provider_response_captures_expiresAt_idx" ON "provider_response_captures"("expiresAt");
