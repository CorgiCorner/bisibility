-- The platform key an assistant attempt was dispatched on, and the key retry number within a step.
ALTER TABLE "assistant_attempts" ADD COLUMN "providerKeyId" TEXT;
ALTER TABLE "assistant_attempts" ADD COLUMN "keyAttempt" INTEGER NOT NULL DEFAULT 0;

-- Every existing row has keyAttempt 0, so the wider unique index holds for all of them.
CREATE UNIQUE INDEX "assistant_attempts_runId_step_keyAttempt_key" ON "assistant_attempts"("runId", "step", "keyAttempt");
DROP INDEX "assistant_attempts_runId_step_key";
