CREATE TYPE "AnalyticsConsentSource" AS ENUM ('web', 'ios', 'api');

CREATE TABLE "user_analytics_consents" (
    "userId" TEXT NOT NULL,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "source" "AnalyticsConsentSource" NOT NULL,
    "version" INTEGER NOT NULL,
    CONSTRAINT "user_analytics_consents_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "user_analytics_consents_version_check" CHECK ("version" > 0),
    CONSTRAINT "user_analytics_consents_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "analytics_person_deletions" (
    "distinctId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    CONSTRAINT "analytics_person_deletions_pkey" PRIMARY KEY ("distinctId")
);
