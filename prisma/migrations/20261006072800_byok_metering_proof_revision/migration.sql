ALTER TABLE metering_usage_evidence ADD COLUMN "proofVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metering_usage_evidence ADD COLUMN "receiptId" TEXT;
ALTER TABLE metering_usage_evidence ADD CONSTRAINT metering_usage_proof_version_nonnegative CHECK ("proofVersion" >= 0);
