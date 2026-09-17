-- CreateEnum
CREATE TYPE "RoadmapSubscriptionState" AS ENUM ('pending', 'confirmed', 'unsubscribed', 'suppressed');

-- CreateEnum
CREATE TYPE "RoadmapTokenPurpose" AS ENUM ('confirm', 'unsubscribe');

-- CreateEnum
CREATE TYPE "RoadmapAnnouncementState" AS ENUM ('draft', 'approved', 'published', 'cancelled');

-- CreateEnum
CREATE TYPE "RoadmapDeliveryKind" AS ENUM ('confirmation', 'availability');

-- CreateEnum
CREATE TYPE "RoadmapDeliveryState" AS ENUM ('pending', 'sending', 'accepted', 'delivered', 'delivery_unknown', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "roadmap_subscriptions" (
    "id" TEXT NOT NULL,
    "emailHmac" TEXT NOT NULL,
    "emailHmacVersion" INTEGER NOT NULL DEFAULT 0,
    "email" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "state" "RoadmapSubscriptionState" NOT NULL DEFAULT 'pending',
    "suppressionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "lastConfirmationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "purpose" "RoadmapTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_announcements" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "availabilityScope" TEXT NOT NULL,
    "ctaHref" TEXT NOT NULL,
    "state" "RoadmapAnnouncementState" NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_deliveries" (
    "id" TEXT NOT NULL,
    "kind" "RoadmapDeliveryKind" NOT NULL,
    "announcementId" TEXT,
    "subscriptionId" TEXT NOT NULL,
    "tokenId" TEXT,
    "state" "RoadmapDeliveryState" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "providerMessageId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_feedback" (
    "id" TEXT NOT NULL,
    "featureId" TEXT,
    "body" TEXT NOT NULL,
    "email" TEXT,
    "language" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roadmap_subscriptions_milestoneId_state_idx" ON "roadmap_subscriptions"("milestoneId", "state");

-- CreateIndex
CREATE INDEX "roadmap_subscriptions_state_requestedAt_idx" ON "roadmap_subscriptions"("state", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_subscriptions_emailHmac_featureId_milestoneId_key" ON "roadmap_subscriptions"("emailHmac", "featureId", "milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_tokens_tokenHash_key" ON "roadmap_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "roadmap_tokens_subscriptionId_purpose_idx" ON "roadmap_tokens"("subscriptionId", "purpose");

-- CreateIndex
CREATE INDEX "roadmap_tokens_expiresAt_idx" ON "roadmap_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "roadmap_announcements_milestoneId_state_idx" ON "roadmap_announcements"("milestoneId", "state");

-- CreateIndex
CREATE INDEX "roadmap_deliveries_state_nextAttemptAt_idx" ON "roadmap_deliveries"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "roadmap_deliveries_subscriptionId_kind_idx" ON "roadmap_deliveries"("subscriptionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_deliveries_announcementId_subscriptionId_key" ON "roadmap_deliveries"("announcementId", "subscriptionId");

-- CreateIndex
CREATE INDEX "roadmap_feedback_createdAt_idx" ON "roadmap_feedback"("createdAt");

-- CreateIndex
CREATE INDEX "roadmap_feedback_featureId_createdAt_idx" ON "roadmap_feedback"("featureId", "createdAt");

-- AddForeignKey
ALTER TABLE "roadmap_tokens" ADD CONSTRAINT "roadmap_tokens_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "roadmap_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_deliveries" ADD CONSTRAINT "roadmap_deliveries_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "roadmap_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_deliveries" ADD CONSTRAINT "roadmap_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "roadmap_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
