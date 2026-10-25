import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

const value = process.env.METERING_TEST_DATABASE_URL;
if (!value || !["localhost", "127.0.0.1"].includes(new URL(value).hostname)) {
  throw new Error("METERING_TEST_DATABASE_URL must point at disposable loopback PostgreSQL.");
}
const client = new pg.Client({ connectionString: value });
const schema = `evidence_constraints_${process.pid}`;

beforeAll(async () => {
  await client.connect();
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  await client.query(`
    CREATE TYPE "NotificationType" AS ENUM ('system');
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE projects (id text PRIMARY KEY);
    CREATE TABLE metering_operation (operation_pk text PRIMARY KEY);
    CREATE TABLE metering_receipt (operation_pk text, sequence int, cost_certainty text);
    CREATE TABLE rank_checks (id text PRIMARY KEY);
    CREATE TABLE rank_check_runs (id text PRIMARY KEY);
    CREATE TABLE notifications (id text PRIMARY KEY);
    CREATE TABLE notification_preferences (id text PRIMARY KEY, "checkInApp" boolean);
    INSERT INTO users VALUES ('u');
    INSERT INTO projects VALUES ('p'), ('other');
    INSERT INTO rank_checks VALUES ('c');
    INSERT INTO rank_check_runs VALUES ('r');
    INSERT INTO notifications VALUES ('n');
    INSERT INTO notification_preferences VALUES ('pref', false);
    INSERT INTO metering_operation VALUES ('op');
  `);
  await client.query(
    readFileSync(
      new URL(
        "../../prisma/migrations/20261023203000_provider_evidence_data_model/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await client.query(`
    INSERT INTO provider_incident_delivery_watermarks ("projectId", "updatedAt") VALUES ('p', now());
    INSERT INTO provider_operation_evidence ("operationPk", "updatedAt") VALUES ('op', now());
    INSERT INTO provider_incidents (id, "projectId", cause, "updatedAt") VALUES ('incident', 'p', 'evidence', now());
    INSERT INTO provider_incident_operations ("incidentId", "operationPk") VALUES ('incident', 'op');
    INSERT INTO provider_incident_transitions (id, "incidentId", version, kind, counts) VALUES ('t', 'incident', 1, 'linked', '{}');
    INSERT INTO provider_partial_evidence (id, namespace, "instanceId", "rankCheckId", kind, "payloadEncrypted", "identityHash", "expiresAt")
      VALUES ('partial', 'ns', 'inst', 'c', 'partial', 'cipher', 'hash', now() + interval '1 day');
    INSERT INTO check_notification_summaries ("notificationId", "checkIds", "topN", "positionMove", version, "updatedAt") VALUES ('n', ARRAY['c'], 10, 5, 1, now());
    INSERT INTO weekly_digest_sends (id, "userId", "projectId", "periodStart", "periodEnd") VALUES ('send', 'u', 'p', '2026-10-13', '2026-10-20');
    INSERT INTO run_tray_dismissals (id, "userId", "runId", "expiresAt") VALUES ('dismiss', 'u', 'r', now() + interval '15 minutes');
  `);
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
  await client.end();
});

const checks = [
  [
    "notification_preferences_threshold_range_check",
    "notification_preferences",
    '"checkNotificationTopN" = 0',
  ],
  [
    "notification_preferences_threshold_range_check",
    "notification_preferences",
    '"checkNotificationTopN" = 101',
  ],
  [
    "notification_preferences_threshold_range_check",
    "notification_preferences",
    '"checkNotificationPositionMove" = 0',
  ],
  [
    "notification_preferences_threshold_range_check",
    "notification_preferences",
    '"checkNotificationPositionMove" = 101',
  ],
  [
    "provider_operation_evidence_depth_check",
    "provider_operation_evidence",
    '"returnedDepth" = -1',
  ],
  [
    "provider_operation_evidence_depth_check",
    "provider_operation_evidence",
    '"returnedDepth" = 101',
  ],
  [
    "provider_operation_evidence_exhaustion_check",
    "provider_operation_evidence",
    '"exhaustionStatus" = NULL, "exhaustionReason" = \'missing status\'',
  ],
  [
    "provider_operation_evidence_exhaustion_check",
    "provider_operation_evidence",
    '"exhaustionStatus" = \'exhausted\', "exhaustionReason" = NULL',
  ],
  [
    "provider_operation_evidence_exhaustion_check",
    "provider_operation_evidence",
    "\"exhaustionStatus\" = 'pending', \"exhaustionReason\" = 'not final'",
  ],
  [
    "provider_operation_evidence_exhaustion_check",
    "provider_operation_evidence",
    "\"exhaustionStatus\" = 'exhausted', \"exhaustionReason\" = ''",
  ],
  [
    "provider_operation_evidence_exhaustion_check",
    "provider_operation_evidence",
    "\"exhaustionStatus\" = 'exhausted', \"exhaustionReason\" = repeat('x', 501)",
  ],
  [
    "provider_operation_evidence_recovery_reason_check",
    "provider_operation_evidence",
    "\"recoveryReason\" = ''",
  ],
  [
    "provider_operation_evidence_recovery_reason_check",
    "provider_operation_evidence",
    "\"recoveryReason\" = repeat('x', 501)",
  ],
  ["provider_partial_evidence_depth_check", "provider_partial_evidence", '"returnedDepth" = -1'],
  ["provider_partial_evidence_depth_check", "provider_partial_evidence", '"returnedDepth" = 101'],
  ["provider_partial_evidence_version_check", "provider_partial_evidence", '"schemaVersion" = 0'],
  ["provider_incidents_open_slot_check", "provider_incidents", '"openSlot" = NULL'],
  ["provider_incidents_open_slot_check", "provider_incidents", "\"openSlot\" = 'other'"],
  ["provider_incidents_open_slot_check", "provider_incidents", "state = 'resolved'"],
  ["provider_incidents_cause_check", "provider_incidents", "cause = 'bad cause'"],
  ["provider_incidents_counts_check", "provider_incidents", "version = 0"],
  ...[
    "resultUnderReviewCount",
    "resultRecoveredCount",
    "resultPartialCount",
    "resultProviderErrorCount",
    "resultMissingCount",
    "costMeasuredCount",
    "costUnknownCount",
    "costUnderReviewCount",
  ].map((column) => ["provider_incidents_counts_check", "provider_incidents", `"${column}" = -1`]),
  ["provider_incident_transitions_version_check", "provider_incident_transitions", "version = 0"],
  ["check_notification_summaries_threshold_check", "check_notification_summaries", '"topN" = 0'],
  [
    "check_notification_summaries_threshold_check",
    "check_notification_summaries",
    '"positionMove" = 101',
  ],
  ["check_notification_summaries_threshold_check", "check_notification_summaries", "version = 0"],
  ["weekly_digest_sends_period_check", "weekly_digest_sends", '"periodStart" = "periodEnd"'],
  ["run_tray_dismissals_expiry_check", "run_tray_dismissals", '"expiresAt" = "dismissedAt"'],
];

test.each(checks)("%s rejects %s %s", async (constraint, table, assignment) => {
  await expect(client.query(`UPDATE "${table}" SET ${assignment}`)).rejects.toMatchObject({
    code: "23514",
    constraint,
  });
});

const duplicates = [
  [
    "provider_incidents_project_cause",
    `INSERT INTO provider_incidents (id, "projectId", cause, "updatedAt") VALUES ('duplicate', 'p', 'evidence', now())`,
  ],
  [
    "provider_incident_operations_operationPk_key",
    `INSERT INTO provider_incident_operations ("incidentId", "operationPk") VALUES ('other', 'op')`,
  ],
  [
    "provider_incident_transitions_version",
    `INSERT INTO provider_incident_transitions (id, "incidentId", version, kind, counts) VALUES ('other', 'incident', 1, 'resolved', '{}')`,
  ],
  [
    "weekly_digest_sends_recipient_period",
    `INSERT INTO weekly_digest_sends (id, "userId", "projectId", "periodStart", "periodEnd") VALUES ('duplicate', 'u', 'p', '2026-10-13', '2026-10-20')`,
  ],
  [
    "run_tray_dismissals_user_run",
    `INSERT INTO run_tray_dismissals (id, "userId", "runId", "expiresAt") VALUES ('duplicate', 'u', 'r', now() + interval '15 minutes')`,
  ],
];

test.each(duplicates)("%s rejects a duplicate", async (constraint, sql) => {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO provider_incidents (id, "projectId", cause, "updatedAt") VALUES ('other', 'other', 'evidence', now())`,
    );
    await expect(client.query(sql)).rejects.toMatchObject({ code: "23505", constraint });
  } finally {
    await client.query("ROLLBACK");
  }
});

test("permits different causes/projects and reopening the same incident", async () => {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO provider_incidents (id, "projectId", cause, "updatedAt") VALUES ('different', 'p', 'other_cause', now()), ('other', 'other', 'evidence', now())`,
    );
    await client.query(
      `UPDATE provider_incidents SET state = 'resolved', "openSlot" = NULL, "resolvedAt" = now() WHERE id = 'incident'`,
    );
    await client.query(
      `UPDATE provider_incidents SET state = 'open', "openSlot" = 'open', "resolvedAt" = NULL WHERE id = 'incident'`,
    );
  } finally {
    await client.query("ROLLBACK");
  }
});

const foreignKeys = [
  ["provider_operation_evidence", "operationPk"],
  ["provider_partial_evidence", "rankCheckId"],
  ["provider_incidents", "projectId"],
  ["provider_incident_operations", "incidentId"],
  ["provider_incident_operations", "operationPk"],
  ["provider_incident_transitions", "incidentId"],
  ["provider_incident_delivery_watermarks", "projectId"],
  ["check_notification_summaries", "notificationId"],
  ["weekly_digest_sends", "userId"],
  ["weekly_digest_sends", "projectId"],
  ["run_tray_dismissals", "userId"],
  ["run_tray_dismissals", "runId"],
];

test.each(foreignKeys)("%s.%s rejects a missing parent", async (table, column) => {
  await expect(
    client.query(`UPDATE "${table}" SET "${column}" = 'missing_parent'`),
  ).rejects.toMatchObject({ code: "23503", constraint: `${table}_${column}_fkey` });
});

test.each([...new Set(foreignKeys.map(([table]) => table))])(
  "%s rejects a duplicate primary key",
  async (table) => {
    await expect(
      client.query(`INSERT INTO "${table}" SELECT * FROM "${table}" LIMIT 1`),
    ).rejects.toMatchObject({ code: "23505", constraint: `${table}_pkey` });
  },
);
