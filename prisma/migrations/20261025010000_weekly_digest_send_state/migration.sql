CREATE TYPE "WeeklyDigestSendStatus" AS ENUM ('claimed', 'sent', 'failed', 'ambiguous');
ALTER TABLE weekly_digest_sends
  ADD COLUMN status "WeeklyDigestSendStatus" NOT NULL DEFAULT 'sent',
  ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastErrorKind" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN "deliveredAt" TIMESTAMPTZ;
