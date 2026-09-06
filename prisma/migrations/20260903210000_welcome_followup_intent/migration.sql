ALTER TABLE "users"
  ADD COLUMN "welcomeFollowupRequestedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeFollowupStartedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeFollowupFinishedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeFollowupExpiredAt" TIMESTAMP(3);

CREATE INDEX "users_welcome_followup_pending_idx"
  ON "users"("welcomeFollowupRequestedAt", "id")
  WHERE "welcomeFollowupRequestedAt" IS NOT NULL
    AND "welcomeFollowupFinishedAt" IS NULL
    AND "welcomeFollowupExpiredAt" IS NULL;
