-- CreateTable
CREATE TABLE "achievement_states" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "showHeader" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "presenceCurrent" INTEGER NOT NULL DEFAULT 0,
    "presenceLongest" INTEGER NOT NULL DEFAULT 0,
    "presenceLastDay" TEXT,
    "practiceCurrent" INTEGER NOT NULL DEFAULT 0,
    "practiceLongest" INTEGER NOT NULL DEFAULT 0,
    "practiceLastDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievement_states_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "achievement_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "localDay" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "achievement_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_awards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "definitionVersion" INTEGER NOT NULL DEFAULT 1,
    "earnedDay" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeZone" TEXT NOT NULL,
    "shareTokenHash" TEXT,

    CONSTRAINT "achievement_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_mails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "awardDay" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "achievement_mails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "achievement_days_processedAt_userId_idx" ON "achievement_days"("processedAt", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_days_userId_epoch_kind_localDay_key" ON "achievement_days"("userId", "epoch", "kind", "localDay");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_awards_shareTokenHash_key" ON "achievement_awards"("shareTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_awards_userId_kind_definitionVersion_key" ON "achievement_awards"("userId", "kind", "definitionVersion");

-- CreateIndex
CREATE INDEX "achievement_mails_status_dueAt_idx" ON "achievement_mails"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_mails_userId_epoch_awardDay_key" ON "achievement_mails"("userId", "epoch", "awardDay");

-- AddForeignKey
ALTER TABLE "achievement_states" ADD CONSTRAINT "achievement_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_days" ADD CONSTRAINT "achievement_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_awards" ADD CONSTRAINT "achievement_awards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_mails" ADD CONSTRAINT "achievement_mails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "achievement_days" ADD CONSTRAINT "achievement_days_kind_check" CHECK ("kind" IN ('presence', 'practice'));
ALTER TABLE "achievement_awards" ADD CONSTRAINT "achievement_awards_kind_check" CHECK ("kind" IN ('presence', 'practice'));
ALTER TABLE "achievement_mails" ADD CONSTRAINT "achievement_mails_status_check" CHECK ("status" IN ('queued', 'sending', 'sent', 'skipped', 'unknown'));
CREATE INDEX "achievement_days_userId_epoch_localDay_idx" ON "achievement_days"("userId", "epoch", "localDay");
