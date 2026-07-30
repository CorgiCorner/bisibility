CREATE INDEX "accounts_providerId_idx" ON "accounts"("providerId");

CREATE TABLE "daily_send_counters" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_send_counters_pkey" PRIMARY KEY ("day")
);
