CREATE TABLE "provider_recovery_proofs" (
  "id" TEXT PRIMARY KEY,
  "operationPk" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "nativeId" TEXT NOT NULL,
  "credentialVersion" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "provider_recovery_proofs_native_key" ON "provider_recovery_proofs" ("namespace", "instanceId", "provider", "accountId", "nativeId");
CREATE INDEX "provider_recovery_proofs_operationPk_idx" ON "provider_recovery_proofs" ("operationPk");
