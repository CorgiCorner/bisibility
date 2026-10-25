import { readFileSync } from "node:fs";
import { notificationPreferencesForMissingRow } from "@/lib/notifications/preference-defaults";
import { resultRecoveryCutoff } from "@/lib/rank-check/recovery-result-grace";
import pg from "pg";
import { afterAll, expect, test } from "vitest";

const { Client } = pg;

function fixtureUrl() {
  const value = process.env.METERING_TEST_DATABASE_URL;
  if (!value)
    throw new Error("METERING_TEST_DATABASE_URL is required for the evidence migration test.");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Evidence migration tests require a disposable loopback database.");
  }
  return value;
}

const schema = `evidence_model_${process.pid}`;
const client = new Client({ connectionString: fixtureUrl() });

async function query<T extends pg.QueryResultRow>(text: string, values?: unknown[]) {
  return client.query<T>(text, values);
}

test("preference migration, evidence backfill, and uniqueness constraints", async () => {
  await client.connect();
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  await client.query(`
    CREATE TYPE "NotificationType" AS ENUM (
      'alert_fired', 'check_complete', 'check_failed', 'invite', 'member_joined',
      'import_done', 'import_failed', 'system'
    );
    CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE projects (id text PRIMARY KEY);
    CREATE TABLE metering_operation (operation_pk text PRIMARY KEY, state text NOT NULL DEFAULT 'settled');
    CREATE TABLE metering_receipt (
      receipt_pk text PRIMARY KEY,
      operation_pk text NOT NULL REFERENCES metering_operation(operation_pk),
      sequence int NOT NULL,
      cost_certainty text NOT NULL,
      cost_units bigint
    );
    CREATE TABLE rank_checks (id text PRIMARY KEY);
    CREATE TABLE rank_check_runs (id text PRIMARY KEY);
    CREATE TABLE notifications (id text PRIMARY KEY);
    CREATE TABLE notification_preferences (
      id text PRIMARY KEY,
      "userId" text NOT NULL,
      "projectId" text NOT NULL,
      "checkInApp" boolean NOT NULL
    );
  `);
  await client.query(`
    INSERT INTO users VALUES ('user_true'), ('user_false'), ('user_missing');
    INSERT INTO projects VALUES ('project_1');
    INSERT INTO notification_preferences VALUES
      ('pref_true', 'user_true', 'project_1', true),
      ('pref_false', 'user_false', 'project_1', false);
    INSERT INTO metering_operation VALUES ('op_measured'), ('op_unknown'), ('op_other');
    INSERT INTO metering_receipt VALUES
      ('r_old', 'op_measured', 1, 'unknown', 1),
      ('r_new', 'op_measured', 2, 'measured', 100),
      ('r_unknown', 'op_unknown', 1, 'unknown', NULL),
      ('r_other', 'op_other', 1, 'estimated', 5);
    INSERT INTO rank_checks VALUES ('check_retained'), ('check_partial');
    INSERT INTO rank_check_runs VALUES ('run_1');
    INSERT INTO notifications VALUES ('note_1');
  `);
  const beforeColumns = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'metering_operation' ORDER BY column_name`,
    [schema],
  );
  const migration = readFileSync(
    new URL(
      "../../prisma/migrations/20261023203000_provider_evidence_data_model/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.query("BEGIN");
  await client.query(migration);
  await client.query("COMMIT");
  expect((await query(`SELECT * FROM provider_operation_evidence`)).rowCount).toBe(0);
  const backfill = readFileSync(
    new URL(
      "../../prisma/migrations/20261023203500_provider_evidence_accounting_backfill/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.query("BEGIN");
  await client.query(backfill);
  // Keep the scan transaction open: neither traffic table may retain its DDL locks.
  const traffic = new Client({ connectionString: fixtureUrl() });
  await traffic.connect();
  try {
    await traffic.query(`SET search_path TO ${schema}`);
    await traffic.query("SET lock_timeout = '250ms'");
    await traffic.query("SELECT * FROM rank_checks LIMIT 1");
    await traffic.query("UPDATE rank_checks SET id = id");
    await traffic.query("SELECT * FROM notification_preferences LIMIT 1");
  } finally {
    await traffic.end();
  }
  await client.query("COMMIT");

  const preferences = await query<{
    checkInApp: boolean;
    checkNotificationPositionMove: number;
    checkNotificationSetting: string;
    checkNotificationTopN: number;
    id: string;
    providerIncidentInApp: boolean;
  }>(`SELECT id, "checkInApp", "checkNotificationSetting", "checkNotificationTopN",
      "checkNotificationPositionMove", "providerIncidentInApp"
      FROM notification_preferences ORDER BY id`);
  expect(preferences.rows).toEqual([
    {
      checkInApp: false,
      checkNotificationPositionMove: 5,
      checkNotificationSetting: "important",
      checkNotificationTopN: 10,
      id: "pref_false",
      providerIncidentInApp: true,
    },
    {
      checkInApp: true,
      checkNotificationPositionMove: 5,
      checkNotificationSetting: "important",
      checkNotificationTopN: 10,
      id: "pref_true",
      providerIncidentInApp: true,
    },
  ]);
  expect(
    (await query(`SELECT id FROM notification_preferences WHERE "userId" = 'user_missing'`))
      .rowCount,
  ).toBe(0);

  expect(notificationPreferencesForMissingRow().checkNotificationSetting).toBe("important");

  const evidence = await query<{
    acceptance: string | null;
    accounting: string;
    exhaustionStatus: string;
    operationPk: string;
  }>(`SELECT "operationPk",
      acceptance::text AS acceptance,
      accounting::text AS accounting,
      "exhaustionStatus"::text AS "exhaustionStatus"
      FROM provider_operation_evidence ORDER BY "operationPk"`);
  expect(evidence.rows).toEqual([
    {
      acceptance: null,
      accounting: "measured",
      exhaustionStatus: "not_applicable",
      operationPk: "op_measured",
    },
    {
      acceptance: null,
      accounting: "unknown",
      exhaustionStatus: "pending",
      operationPk: "op_unknown",
    },
  ]);
  expect(
    (await query(`SELECT cost_units FROM metering_receipt WHERE receipt_pk = 'r_new'`)).rows,
  ).toEqual([{ cost_units: "100" }]);
  const afterColumns = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'metering_operation' ORDER BY column_name`,
    [schema],
  );
  expect(afterColumns.rows).toEqual(beforeColumns.rows);

  await query(
    `INSERT INTO provider_incidents (id, "projectId", cause, "updatedAt") VALUES ('open_1', 'project_1', 'provider_evidence', now())`,
  );
  await expect(
    query(
      `INSERT INTO provider_incidents (id, "projectId", cause, "updatedAt") VALUES ('open_2', 'project_1', 'provider_evidence', now())`,
    ),
  ).rejects.toMatchObject({ code: "23505" });
  await query(
    `UPDATE provider_incidents SET state = 'resolved', "openSlot" = NULL, "resolvedAt" = now() WHERE id = 'open_1'`,
  );
  for (const state of ["open", "resolved"]) {
    await expect(
      query(
        `INSERT INTO provider_incidents (id, "projectId", cause, state, "openSlot", "resolvedAt", "updatedAt")
       VALUES ('successor', 'project_1', 'provider_evidence', $1::"ProviderIncidentState", $2, $3, now())`,
        [state, state === "open" ? "open" : null, state === "resolved" ? new Date() : null],
      ),
    ).rejects.toMatchObject({ code: "23505", constraint: "provider_incidents_project_cause" });
  }
  await query(
    `UPDATE provider_incidents SET state = 'open', "openSlot" = 'open', "resolvedAt" = NULL WHERE id = 'open_1'`,
  );
  expect(
    (
      await query(`SELECT id, state::text, "resolvedAt" FROM provider_incidents
    WHERE "projectId" = 'project_1' AND cause = 'provider_evidence'`)
    ).rows,
  ).toEqual([{ id: "open_1", state: "open", resolvedAt: null }]);

  const periodEnd = "2026-10-20T06:15:00.000Z";
  await query(
    `INSERT INTO weekly_digest_sends (id, "userId", "projectId", "periodStart", "periodEnd")
     VALUES ('send_1', 'user_true', 'project_1', '2026-10-13T06:15:00.000Z', $1)`,
    [periodEnd],
  );
  await expect(
    query(
      `INSERT INTO weekly_digest_sends (id, "userId", "projectId", "periodStart", "periodEnd")
       VALUES ('send_2', 'user_true', 'project_1', '2026-10-13T06:15:00.000Z', $1)`,
      [periodEnd],
    ),
  ).rejects.toMatchObject({ code: "23505" });

  await query(
    `INSERT INTO run_tray_dismissals (id, "userId", "runId", "dismissedAt", "expiresAt")
     VALUES ('dismiss_1', 'user_true', 'run_1', '2026-10-23T06:01:00.000Z', '2026-10-23T06:15:00.000Z')`,
  );
  await expect(
    query(
      `INSERT INTO run_tray_dismissals (id, "userId", "runId", "dismissedAt", "expiresAt")
       VALUES ('dismiss_2', 'user_true', 'run_1', '2026-10-23T06:02:00.000Z', '2026-10-23T06:15:00.000Z')`,
    ),
  ).rejects.toMatchObject({ code: "23505" });

  const now = new Date("2026-10-23T12:00:00.000Z");
  const cutoff = resultRecoveryCutoff(now);
  await query(
    `CREATE TABLE rank_check_result_evidence (
      namespace text NOT NULL,
      "instanceId" text NOT NULL,
      "rankCheckId" text PRIMARY KEY,
      "blockedCode" text,
      "expiresAt" timestamptz NOT NULL,
      "createdAt" timestamptz NOT NULL
    )`,
  );
  await query(
    `INSERT INTO rank_check_result_evidence VALUES ('ns', 'inst', 'check_retained', NULL, $1, $2)`,
    [new Date(now.getTime() + 60_000), cutoff],
  );
  await query(
    `INSERT INTO provider_partial_evidence
      (id, namespace, "instanceId", "rankCheckId", kind, "payloadEncrypted", "identityHash", "expiresAt")
     VALUES ('partial_1', 'ns', 'inst', 'check_partial', 'partial', 'cipher', 'hash', $1)`,
    [new Date(now.getTime() + 60_000)],
  );
  const selected = await query<{ rankCheckId: string }>(
    `SELECT "rankCheckId" FROM rank_check_result_evidence
     WHERE namespace = 'ns' AND "instanceId" = 'inst' AND "blockedCode" IS NULL
       AND "expiresAt" > $1 AND "createdAt" <= $2`,
    [now, cutoff],
  );
  expect(selected.rows).toEqual([{ rankCheckId: "check_retained" }]);
  expect(
    (await query(`SELECT id FROM provider_partial_evidence WHERE "rankCheckId" = 'check_partial'`))
      .rowCount,
  ).toBe(1);
});

afterAll(async () => {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
  await client.end().catch(() => undefined);
});
