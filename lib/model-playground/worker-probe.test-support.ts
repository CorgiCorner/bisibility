/** Empty unrelated intent families let recovery fixtures execute the complete shipped OR. */
export const unrelatedIntentDdl = `
CREATE TABLE provider_comparison_sides(status text);
CREATE TABLE ai_tracking_runs(id text,state text);
CREATE TABLE ai_tracking_samples("runId" text,dispatch text,"providerTaskId" text);
CREATE TABLE local_monitor_launch_intents(state text,"leaseExpiresAt" timestamptz);
CREATE TABLE ai_tracking_schedules(enabled boolean,"archivedAt" timestamptz,"nextRunAt" timestamptz);
CREATE TABLE search_analytics_imports("syncRequestedAt" timestamptz,"syncStartedAt" timestamptz,
  "pausedReason" text,source text,state text);
ALTER TABLE provider_connections ADD COLUMN "firstSyncRequestedAt" timestamptz,
  ADD COLUMN "firstSyncFinishedAt" timestamptz, ADD COLUMN "firstSyncStartedAt" timestamptz;
ALTER TABLE users ADD COLUMN "welcomeFollowupRequestedAt" timestamptz,
  ADD COLUMN "welcomeFollowupFinishedAt" timestamptz, ADD COLUMN "welcomeFollowupExpiredAt" timestamptz,
  ADD COLUMN "welcomeFollowupStartedAt" timestamptz;
CREATE TABLE rank_check_runs(status text,"claimedAt" timestamptz,"orchestrationWorkflowId" text);
CREATE TABLE alert_evaluation_intents(state text,"leaseUntil" timestamptz);
`;
