CREATE TABLE "mail_provider_receipts" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_provider_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mail_provider_receipts_provider_messageId_key" ON "mail_provider_receipts"("provider", "messageId");
CREATE TABLE "mail_suppressions" (
  "recipient" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_suppressions_pkey" PRIMARY KEY ("recipient")
);
CREATE TABLE "mail_feedback_events" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mail_feedback_events_pkey" PRIMARY KEY ("id")
);
