-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "triggeredAlertId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "alertEmail" BOOLEAN NOT NULL DEFAULT true,
    "alertInApp" BOOLEAN NOT NULL DEFAULT true,
    "checkEmail" BOOLEAN NOT NULL DEFAULT false,
    "checkInApp" BOOLEAN NOT NULL DEFAULT true,
    "inviteEmail" BOOLEAN NOT NULL DEFAULT true,
    "inviteInApp" BOOLEAN NOT NULL DEFAULT true,
    "importEmail" BOOLEAN NOT NULL DEFAULT true,
    "importInApp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitors_projectId_idx" ON "competitors"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_projectId_domain_key" ON "competitors"("projectId", "domain");

-- CreateIndex
CREATE INDEX "delivery_attempts_triggeredAlertId_idx" ON "delivery_attempts"("triggeredAlertId");

-- CreateIndex
CREATE INDEX "saved_views_projectId_idx" ON "saved_views"("projectId");

-- CreateIndex
CREATE INDEX "notification_preferences_projectId_idx" ON "notification_preferences"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_projectId_key" ON "notification_preferences"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_triggeredAlertId_fkey" FOREIGN KEY ("triggeredAlertId") REFERENCES "triggered_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
