-- AlterTable
ALTER TABLE "delivery_attempts" ADD COLUMN "webhookEndpointId" TEXT;

-- CreateIndex
CREATE INDEX "delivery_attempts_webhookEndpointId_idx" ON "delivery_attempts"("webhookEndpointId");

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_webhookEndpointId_fkey" FOREIGN KEY ("webhookEndpointId") REFERENCES "webhook_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
