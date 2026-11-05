-- CreateTable
CREATE TABLE "prepared_email_messages" (
    "id" TEXT NOT NULL,
    "deliveryIdentity" TEXT NOT NULL,
    "deliveryInputs" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "listUnsubscribeUrl" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "providerId" TEXT,
    "idempotent" BOOLEAN NOT NULL DEFAULT false,
    "budgetReserved" BOOLEAN NOT NULL DEFAULT false,
    "providerCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prepared_email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prepared_email_messages_deliveryIdentity_key" ON "prepared_email_messages"("deliveryIdentity");

-- CreateIndex
CREATE UNIQUE INDEX "prepared_email_messages_idempotencyKey_key" ON "prepared_email_messages"("idempotencyKey");

-- CreateIndex
CREATE INDEX "prepared_email_messages_state_idx" ON "prepared_email_messages"("state");
