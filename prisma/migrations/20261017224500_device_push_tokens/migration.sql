-- Mobile push alert channel: device push tokens and the per-member alertPush preference.
-- AlterEnum
ALTER TYPE "AlertChannel" ADD VALUE 'push';

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "alertPush" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "device_push_tokens" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_push_tokens_publicId_key" ON "device_push_tokens"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "device_push_tokens_token_key" ON "device_push_tokens"("token");

-- CreateIndex
CREATE INDEX "device_push_tokens_userId_revokedAt_idx" ON "device_push_tokens"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddCheckConstraints
ALTER TABLE "device_push_tokens"
  ADD CONSTRAINT "device_push_tokens_public_id_contract_format" CHECK ("publicId" ~ '^dpt_[a-z][a-z0-9]{23}$'::text),
  ADD CONSTRAINT "device_push_tokens_environment" CHECK ("environment" IN ('sandbox', 'production')),
  ADD CONSTRAINT "device_push_tokens_token_format" CHECK ("token" ~ '^[0-9a-f]{32,200}$'),
  ADD CONSTRAINT "device_push_tokens_bundle_id" CHECK (length("bundleId") BETWEEN 1 AND 155);
