CREATE TABLE metering_recovery_triage (
  namespace text NOT NULL,
  "caseKey" text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  "basisHash" text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  reason text,
  "assigneeId" text,
  "snoozedUntil" timestamptz,
  "updatedById" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, "caseKey"),
  CONSTRAINT recovery_triage_status CHECK (status IN ('open','acknowledged','investigating','waiting_evidence','escalated')),
  CONSTRAINT recovery_triage_snooze CHECK ((status='waiting_evidence') = ("snoozedUntil" IS NOT NULL))
);
CREATE INDEX metering_recovery_triage_status_idx ON metering_recovery_triage(namespace,status,"snoozedUntil");

CREATE TABLE metering_recovery_commands (
  namespace text NOT NULL,
  "commandId" text NOT NULL,
  "identityHash" text NOT NULL,
  "actorId" text NOT NULL,
  action text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  input jsonb NOT NULL,
  result jsonb,
  "leaseId" text,
  "leaseExpiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace,"commandId"),
  CONSTRAINT recovery_command_state CHECK (state IN ('queued','running','completed','failed'))
);
CREATE INDEX metering_recovery_commands_state_idx ON metering_recovery_commands(namespace,state,"createdAt");

CREATE TABLE rank_check_result_evidence (
  namespace text NOT NULL,
  "instanceId" text NOT NULL,
  "rankCheckId" text PRIMARY KEY REFERENCES rank_checks(id) ON DELETE CASCADE,
  "identityHash" text NOT NULL,
  "payloadEncrypted" text NOT NULL,
  "schemaVersion" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "blockedCode" text
);
CREATE INDEX rank_check_result_evidence_expiry_idx ON rank_check_result_evidence("expiresAt");
ALTER TABLE queued_rank_check_tasks ADD COLUMN "recoveryContextHash" text;
CREATE TABLE rank_check_run_recovery_grants (
  "runId" text PRIMARY KEY REFERENCES rank_check_runs(id) ON DELETE CASCADE,
  namespace text NOT NULL,
  "instanceId" text NOT NULL,
  "ownerId" text NOT NULL,
  "actorId" text NOT NULL,
  coverage jsonb NOT NULL,
  "validUntil" timestamptz NOT NULL,
  "requestedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
