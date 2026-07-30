import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseConnectionConfig, databaseSchemaFromUrl } from "../../lib/db/pool-config.ts";
import { publicIdContractEntities } from "../../lib/public-id-contract/definition.ts";
import { cleanupPublicIdV3N1Artifacts } from "../../lib/public-id-contract/n1-cleanup.ts";
import { reblockPublicIdV3N1WriteGate } from "../../lib/public-id-contract/n1-write-gate.ts";
import { backfillPostReleasePublicIdLedger } from "../../lib/public-id-contract/post-release-ledger.ts";
import { assertPublicIdContractPrepared } from "../../lib/public-id-contract/prepare.ts";
import { readPublicIdContractReadiness } from "../../lib/public-id-contract/readiness.ts";
import { runPublicIdContractPrepare } from "../../lib/public-id-contract/upgrade.ts";
import { withPublicIdV3CutoverBypass } from "../../lib/public-id-contract/write-gate.ts";
import { canonicalJson } from "../../lib/public-id-migrator/json-rewrite.ts";
import { migratePublicIds } from "../../lib/public-id-migrator/runner.ts";
import type { PublicIdMigrationDatabase } from "../../lib/public-id-migrator/types.ts";
import {
  auditFixtureIds,
  createPreparedNFixture,
  fixtureIds,
  insertFixtureRow,
} from "./public-id-contract-fixture.ts";

const { Client } = pg;
const v3ExpandMigration = "20260729210000_public_id_v3_expand";
const v3WriteGateMigration = "20260729210500_public_id_v3_write_gate";
const v3AuditTombstonesMigration = "20260729211000_public_id_v3_audit_tombstones";
const v3ContractMigration = "20260729220000_public_id_v3_contract";
const releaseN = "a".repeat(40);
const releaseN1 = "b".repeat(40);
const cutoverChecksum =
  "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a";
const databaseUrl = process.env.PUBLIC_ID_CONTRACT_DATABASE_URL;
if (!databaseUrl) throw new Error("PUBLIC_ID_CONTRACT_DATABASE_URL is required.");

const baseSchema = databaseSchemaFromUrl(databaseUrl);
if (!baseSchema?.startsWith("public_id_contract_final_")) {
  throw new Error(
    "PUBLIC_ID_CONTRACT_DATABASE_URL must select a disposable public_id_contract_final_* schema.",
  );
}

const root = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const db = new Client({ connectionString: databaseUrl, ...databaseConnectionConfig(databaseUrl) });

const legacyPrefixOverrides = {
  al: "alert",
  alr: "rule",
  cmp: "comp",
  dwh: "hook",
  ferry: "mtok",
  imp: "job",
  inv: "invite",
  mbr: "member",
  ntf: "notif",
  sid: "ses",
  svkw: "skw",
  viw: "view",
  we: "webhook",
} as const;

function quotedIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return `"${value}"`;
}

async function applySchemaBeforeV3Expand(database: pg.Client) {
  const migrationRoot = join(root, "prisma", "migrations");
  const directories = await readdir(migrationRoot, { withFileTypes: true });
  const migrations = directories
    .filter((entry) => entry.isDirectory() && entry.name < v3ExpandMigration)
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    await database.query(await readFile(join(migrationRoot, migration, "migration.sql"), "utf8"));
  }
}

async function applyV3BaseMigrations(database: pg.Client) {
  await database.query(
    await readFile(
      join(root, "prisma", "migrations", v3ExpandMigration, "migration.sql"),
      "utf8",
    ),
  );
  await database.query(
    await readFile(
      join(root, "prisma", "migrations", v3WriteGateMigration, "migration.sql"),
      "utf8",
    ),
  );
}

async function applyV3AuditTombstonesMigration(database: pg.Client) {
  await database.query(
    await readFile(
      join(root, "prisma", "migrations", v3AuditTombstonesMigration, "migration.sql"),
      "utf8",
    ),
  );
}

async function applyV3Migrations(database: pg.Client) {
  await applyV3BaseMigrations(database);
  await applyV3AuditTombstonesMigration(database);
}

async function assertWriteGateBlocksApplicationWrites(database: pg.Client) {
  const gate = await database.query<{ writesBlocked: boolean }>(
    `SELECT "writesBlocked" FROM "public_id_v3_write_gate" WHERE "id" IS TRUE`,
  );
  assert.equal(gate.rows[0]?.writesBlocked, true);
  const statements = [
    {
      sql: `INSERT INTO "users" DEFAULT VALUES`,
      values: undefined,
    },
    {
      sql: `UPDATE "users" SET "name" = "name" WHERE "id" = $1`,
      values: [fixtureIds.user],
    },
    {
      sql: `DELETE FROM "users" WHERE "id" = $1`,
      values: [fixtureIds.user],
    },
    {
      sql: `TRUNCATE TABLE "users" CASCADE`,
      values: undefined,
    },
  ];
  for (const statement of statements) {
    await assert.rejects(
      database.query(statement.sql, statement.values),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "55000" &&
        /Application writes are blocked during the public ID v3 cutover/.test(error.message),
    );
  }

  await database.query(
    `SELECT set_config(
       'bisibility.public_id_write_gate_bypass',
       'public-id-v3-wrong-phase',
       FALSE
     )`,
  );
  await assert.rejects(
    database.query(`UPDATE "users" SET "name" = "name" WHERE "id" = $1`, [
      fixtureIds.user,
    ]),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "55000",
  );
  await database.query(
    `SELECT set_config('bisibility.public_id_write_gate_bypass', '', FALSE)`,
  );

  await database.query(`DELETE FROM "public_id_v3_write_gate" WHERE "id" IS TRUE`);
  await assert.rejects(
    database.query(`UPDATE "users" SET "name" = "name" WHERE "id" = $1`, [
      fixtureIds.user,
    ]),
    /query returned no rows/,
  );
  await database.query(
    `INSERT INTO "public_id_v3_write_gate" (
       "id",
       "phase",
       "releasePolicy",
       "targetAppRelease",
       "writesBlocked"
     ) VALUES (
       TRUE,
       'public-id-v3-n',
       'automatic',
       '0000000000000000000000000000000000000000',
       TRUE
     )`,
  );
}

async function createLegacyFixture(database: pg.Client) {
  await createPreparedNFixture(database, {
    apiKeyPrefix: "bsk_live_fixture",
    includeBacklinkPublicId: false,
    personalTokenPrefix: "bsp_live_fixture",
    prefixOverrides: legacyPrefixOverrides,
  });
  await insertFixtureRow(
    database,
    "api_keys",
    ["id", "publicId", "projectId", "name", "hashedKey", "prefix"],
    [
      "api-key-current",
      "key_b00000000000000000000000",
      fixtureIds.project,
      "current test key",
      "sha256:fixture-current-api-key",
      "bsb_key_test_current",
    ],
  );
  await insertFixtureRow(
    database,
    "personal_access_tokens",
    ["id", "publicId", "userId", "name", "hashedKey", "prefix"],
    [
      "pat-current",
      "pat_b00000000000000000000000",
      fixtureIds.user,
      "current personal token",
      "sha256:fixture-current-pat",
      "bsb_pat_live_current",
    ],
  );
}

async function assertPreparedV3(database: pg.Client) {
  const migrationDb = database as unknown as PublicIdMigrationDatabase;
  await assertPublicIdContractPrepared(migrationDb);

  for (const entity of publicIdContractEntities) {
    const values = await database.query<{ publicId: string }>(
      `SELECT "publicId" FROM ${quotedIdentifier(entity.table)}`,
    );
    assert.ok(values.rows.length > 0, entity.table);
    for (const row of values.rows) {
      assert.match(row.publicId, new RegExp(`^${entity.prefix}_[a-z][a-z0-9]{23}$`));
    }
  }

  const credentials = await database.query<{
    id: string;
    revokedAt: Date | null;
  }>(
    `SELECT "id", "revokedAt" FROM "api_keys"
     UNION ALL
     SELECT "id", "revokedAt" FROM "personal_access_tokens"
     ORDER BY "id"`,
  );
  const revokedAt = new Map(credentials.rows.map((row) => [row.id, row.revokedAt]));
  assert.ok(revokedAt.get(fixtureIds.api_key) instanceof Date);
  assert.ok(revokedAt.get(fixtureIds.personal_access_token) instanceof Date);
  assert.equal(revokedAt.get("api-key-current"), null);
  assert.equal(revokedAt.get("pat-current"), null);

  const ids = await database.query<{
    alertId: string;
    alertRuleId: string;
    cloudImportJobId: string;
    competitorId: string;
    ingestHookId: string;
    inviteId: string;
    keywordId: string;
    migrationTokenId: string;
    projectId: string;
    savedKeywordId: string;
    savedViewId: string;
    sessionId: string;
    webhookEndpointId: string;
  }>(
    `SELECT
       (SELECT "publicId" FROM "triggered_alerts" WHERE "id" = $1) AS "alertId",
       (SELECT "publicId" FROM "alert_rules" WHERE "id" = $2) AS "alertRuleId",
       (SELECT "publicId" FROM "cloud_import_jobs" WHERE "id" = $3) AS "cloudImportJobId",
       (SELECT "publicId" FROM "competitors" WHERE "id" = $4) AS "competitorId",
       (SELECT "publicId" FROM "ingest_hooks" WHERE "id" = $5) AS "ingestHookId",
       (SELECT "publicId" FROM "invites" WHERE "id" = $6) AS "inviteId",
       (SELECT "publicId" FROM "keywords" WHERE "id" = $7) AS "keywordId",
       (SELECT "publicId" FROM "migration_tokens" WHERE "id" = $8) AS "migrationTokenId",
       (SELECT "publicId" FROM "projects" WHERE "id" = $9) AS "projectId",
       (SELECT "publicId" FROM "saved_keywords" WHERE "id" = $10) AS "savedKeywordId",
       (SELECT "publicId" FROM "saved_views" WHERE "id" = $11) AS "savedViewId",
       (SELECT "publicId" FROM "sessions" WHERE "id" = $12) AS "sessionId",
       (SELECT "publicId" FROM "webhook_endpoints" WHERE "id" = $13) AS "webhookEndpointId"`,
    [
      fixtureIds.triggered_alert,
      fixtureIds.alert_rule,
      fixtureIds.cloud_import_job,
      fixtureIds.competitor,
      fixtureIds.ingest_hook,
      fixtureIds.invite,
      fixtureIds.keyword,
      fixtureIds.migration_token,
      fixtureIds.project,
      fixtureIds.saved_keyword,
      fixtureIds.saved_view,
      fixtureIds.session,
      fixtureIds.webhook_endpoint,
    ],
  );
  const publicIds = ids.rows[0];
  assert.ok(publicIds);
  const {
    alertId,
    alertRuleId,
    cloudImportJobId,
    competitorId,
    ingestHookId,
    inviteId,
    keywordId,
    migrationTokenId,
    projectId,
    savedKeywordId,
    savedViewId,
    sessionId,
    webhookEndpointId,
  } = publicIds;
  assert.ok(keywordId);
  assert.ok(projectId);

  const denormalized = await database.query<{
    auditAfter: { keywordId?: string };
    auditTargetId: string;
    manifest: { source_project_id?: string; version?: number };
    notificationPayload: {
      alertId?: string;
      href?: string;
      jobId?: string;
      keywordId?: string;
      rankCheckId?: string;
      ruleId?: string;
    };
    savedViewConfig: { filters?: { excludedKeywordIds?: string[] } };
  }>(
    `SELECT
       (SELECT "after" FROM "audit_logs" WHERE "id" = $1) AS "auditAfter",
       (SELECT "targetId" FROM "audit_logs" WHERE "id" = $1) AS "auditTargetId",
       (SELECT "manifest" FROM "cloud_import_jobs" WHERE "id" = $2) AS "manifest",
       (SELECT "payload" FROM "notifications" WHERE "id" = $3) AS "notificationPayload",
       (SELECT "config" FROM "saved_views" WHERE "id" = $4) AS "savedViewConfig"`,
    [
      fixtureIds.audit_log,
      fixtureIds.cloud_import_job,
      fixtureIds.notification,
      fixtureIds.saved_view,
    ],
  );
  const payloads = denormalized.rows[0];
  assert.equal(payloads?.auditAfter.keywordId, keywordId);
  assert.equal(payloads?.auditTargetId, keywordId);
  assert.deepEqual(payloads?.manifest, { source_project_id: projectId, version: 5 });
  assert.equal(payloads?.notificationPayload.alertId, alertId);
  assert.equal(payloads?.notificationPayload.keywordId, keywordId);
  assert.equal(payloads?.notificationPayload.ruleId, alertRuleId);
  assert.equal(payloads?.notificationPayload.href, `/app/${projectId}/keywords/${keywordId}`);
  assert.equal(payloads?.notificationPayload.rankCheckId, fixtureIds.rank_check);
  assert.equal(payloads?.notificationPayload.jobId, fixtureIds.cloud_import_job);
  assert.deepEqual(payloads?.savedViewConfig.filters?.excludedKeywordIds, [keywordId]);

  const chunks = await database.query<{
    checksum: string;
    id: string;
    kind: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT "id", "kind", "payload", "checksum"
       FROM "migration_import_chunks"
      WHERE "id" = ANY($1::text[])
      ORDER BY "index"`,
    [[fixtureIds.migration_keyword_chunk, fixtureIds.migration_sections_chunk]],
  );
  assert.equal(chunks.rows.length, 2);
  assert.deepEqual(chunks.rows[0]?.payload, {
    keywords: [
      {
        device: "desktop",
        location: "United States",
        rankingHistory: [],
        text: "ordinary unchanged payload",
      },
    ],
  });
  assert.deepEqual(chunks.rows[1]?.payload, { sections: {} });
  for (const chunk of chunks.rows) {
    const checksum = `sha256:${createHash("sha256")
      .update(canonicalJson({ version: 5, kind: chunk.kind, ...chunk.payload }))
      .digest("hex")}`;
    assert.equal(chunk.checksum, checksum);
  }

  const auditRows = await database.query<{
    after: Record<string, unknown> | null;
    before: Record<string, unknown> | null;
    id: string;
    targetId: string;
  }>(
    `SELECT "id", "targetId", "before", "after"
       FROM "audit_logs"
      WHERE "id" = ANY($1::text[])`,
    [Object.values(auditFixtureIds)],
  );
  const audits = new Map(auditRows.rows.map((row) => [row.id, row]));
  assert.deepEqual(audits.get(auditFixtureIds.sessionRevoked)?.before, { id: sessionId });
  assert.deepEqual(audits.get(auditFixtureIds.alertRule)?.before, { id: alertRuleId });
  assert.deepEqual(audits.get(auditFixtureIds.alertRule)?.after, { id: alertRuleId });
  assert.deepEqual(audits.get(auditFixtureIds.competitor)?.before, { id: competitorId });
  assert.deepEqual(audits.get(auditFixtureIds.competitor)?.after, { id: competitorId });
  assert.deepEqual(audits.get(auditFixtureIds.ingestHook)?.before, { id: ingestHookId });
  assert.deepEqual(audits.get(auditFixtureIds.ingestHook)?.after, { id: ingestHookId });
  assert.deepEqual(audits.get(auditFixtureIds.webhookEndpoint)?.before, {
    publicId: webhookEndpointId,
  });
  assert.deepEqual(audits.get(auditFixtureIds.webhookEndpoint)?.after, {
    publicId: webhookEndpointId,
  });
  for (const id of [
    auditFixtureIds.cloudCreate,
    auditFixtureIds.cloudBegin,
    auditFixtureIds.cloudSessionCreate,
    auditFixtureIds.cloudDone,
    auditFixtureIds.cloudFail,
  ]) {
    assert.deepEqual(audits.get(id)?.after, { jobId: cloudImportJobId });
  }
  for (const id of [auditFixtureIds.cloudAdvance, auditFixtureIds.cloudCancel]) {
    assert.deepEqual(audits.get(id)?.before, { id: cloudImportJobId });
    assert.deepEqual(audits.get(id)?.after, { id: cloudImportJobId });
  }
  assert.deepEqual(audits.get(auditFixtureIds.migrationToken)?.after, {
    id: migrationTokenId,
  });
  assert.match(
    audits.get(auditFixtureIds.orphanLegacySession)?.targetId ?? "",
    /^sid_[a-z][a-z0-9]{23}$/,
  );
  assert.notEqual(audits.get(auditFixtureIds.orphanLegacySession)?.targetId, sessionId);
  assert.match(
    audits.get(auditFixtureIds.orphanProject)?.targetId ?? "",
    /^prj_[a-z][a-z0-9]{23}$/,
  );
  assert.notEqual(audits.get(auditFixtureIds.orphanProject)?.targetId, projectId);
  assert.deepEqual(audits.get(auditFixtureIds.savedView)?.before, {
    savedViewId,
  });
  assert.deepEqual(audits.get(auditFixtureIds.savedView)?.after, {
    savedViewId,
  });
  assert.deepEqual(audits.get(auditFixtureIds.savedKeyword)?.before, {
    publicIds: [savedKeywordId],
  });
  assert.deepEqual(audits.get(auditFixtureIds.inviteAccept)?.after, { inviteId });
  assert.equal(auditRows.rows.length, Object.keys(auditFixtureIds).length);
  for (const row of auditRows.rows) {
    if (
      row.id !== auditFixtureIds.orphanProject &&
      row.id !== auditFixtureIds.orphanLegacySession
    ) {
      assert.equal(row.targetId, projectId);
    }
  }

  const denormalizedValues = await database.query<{ value: string }>(
    `SELECT "payload"::text AS "value" FROM "notifications"
     UNION ALL SELECT "config"::text FROM "saved_views"
     UNION ALL SELECT "manifest"::text FROM "cloud_import_jobs"
     UNION ALL SELECT "payload"::text FROM "migration_import_chunks"
     UNION ALL
       SELECT jsonb_build_object(
         'targetId', "targetId",
         'before', "before",
         'after', "after"
       )::text
       FROM "audit_logs"`,
  );
  const legacyId =
    /(?:^|[^a-z0-9])(?:alert|rule|comp|hook|invite|job|member|mtok|notif|ses|skw|view|webhook)_[a-z0-9]/;
  for (const row of denormalizedValues.rows) {
    assert.doesNotMatch(row.value, legacyId);
  }

  const workflow = await database.query<{ workflowRunId: string }>(
    `SELECT "workflowRunId" FROM "rank_checks" WHERE "id" = $1`,
    [fixtureIds.rank_check],
  );
  assert.equal(workflow.rows[0]?.workflowRunId, "temporal-workflow-identity");

  const ledger = await database.query<{ incomplete: number; total: number }>(
    `SELECT COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE "migratedAt" IS NULL)::int AS "incomplete"
       FROM "public_id_v3_migrations"`,
  );
  const addressableRows = await database.query<{ total: number }>(
    `SELECT (${publicIdContractEntities
      .map((entity) => `(SELECT COUNT(*) FROM ${quotedIdentifier(entity.table)})`)
      .join(" + ")})::int AS "total"`,
  );
  assert.equal(ledger.rows[0]?.incomplete, 0);
  assert.equal(ledger.rows[0]?.total, (addressableRows.rows[0]?.total ?? 0) + 2);
}

async function assertFinalReadiness(database: pg.Client) {
  assert.equal(
    await readPublicIdContractReadiness({
      $queryRawUnsafe: async <T>(query: string) =>
        (await database.query(query)).rows as T,
    }),
    true,
  );
}

async function releaseNWriteGate(database: pg.Client) {
  await database.query(
    `INSERT INTO "data_migrations" (
       "id", "checksum", "attempts", "startedAt", "finishedAt"
     ) VALUES ($1, $2, 1, NOW(), NOW())`,
    ["20260729213000_public_id_v3_cutover", cutoverChecksum],
  );
  await database.query(
    `UPDATE "public_id_v3_write_gate"
        SET "releasePolicy" = 'operator',
            "targetAppRelease" = $1,
            "writesBlocked" = FALSE,
            "releasedAt" = NOW(),
            "releasedAppRelease" = $1`,
    [releaseN],
  );
}

async function prepareBlockedN1(database: pg.Client) {
  await releaseNWriteGate(database);
  await reblockPublicIdV3N1WriteGate(
    database as unknown as PublicIdMigrationDatabase,
    {
      phase: "public-id-v3-n1",
      releasePolicy: "operator",
      targetAppRelease: releaseN1,
    },
  );
}

async function applyN1Contract(database: pg.Client) {
  await database.query(
    await readFile(
      join(root, "prisma", "migrations", v3ContractMigration, "migration.sql"),
      "utf8",
    ),
  );
}

async function enforceAndCleanN1(database: pg.Client) {
  await prepareBlockedN1(database);
  await applyN1Contract(database);
  await assertFinalReadiness(database);

  const finalColumns = await database.query<{ count: number }>(
    `SELECT COUNT(*)::int AS "count"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
        AND column_name = 'publicId'
        AND is_nullable = 'NO'`,
    [publicIdContractEntities.map(({ table }) => table)],
  );
  assert.equal(finalColumns.rows[0]?.count, publicIdContractEntities.length);

  await cleanupPublicIdV3N1Artifacts(
    database as unknown as PublicIdMigrationDatabase,
    releaseN1,
    "operator",
  );
  await assertFinalReadiness(database);
  const artifacts = await database.query<{
    functionInstalled: boolean;
    gateInstalled: boolean;
    ledgerInstalled: boolean;
    triggers: number;
  }>(
    `SELECT
       to_regclass(format('%I.public_id_v3_write_gate', current_schema())) IS NOT NULL
         AS "gateInstalled",
       to_regclass(format('%I.public_id_v3_migrations', current_schema())) IS NOT NULL
         AS "ledgerInstalled",
       to_regprocedure(
         format('%I.enforce_public_id_v3_write_gate()', current_schema())
       ) IS NOT NULL AS "functionInstalled",
       (
         SELECT COUNT(*)::int
           FROM pg_catalog.pg_trigger
          WHERE NOT tgisinternal
            AND tgname = 'public_id_v3_write_gate'
       ) AS "triggers"`,
  );
  assert.deepEqual(artifacts.rows[0], {
    functionInstalled: false,
    gateInstalled: false,
    ledgerInstalled: false,
    triggers: 0,
  });
}

async function inLegacySchema(
  label: string,
  test: (database: pg.Client) => Promise<void>,
  options: { auditTombstones?: boolean } = {},
) {
  const schema = `${baseSchema}_${label}`;
  await db.query(`CREATE SCHEMA ${quotedIdentifier(schema)}`);
  try {
    await db.query(`SET search_path TO ${quotedIdentifier(schema)}`);
    await applySchemaBeforeV3Expand(db);
    await createLegacyFixture(db);
    if (options.auditTombstones === false) {
      await applyV3BaseMigrations(db);
    } else {
      await applyV3Migrations(db);
    }
    await assertWriteGateBlocksApplicationWrites(db);
    await test(db);
  } finally {
    await db.query("RESET search_path");
    await db.query(`DROP SCHEMA IF EXISTS ${quotedIdentifier(schema)} CASCADE`);
  }
}

async function expectFreshRecoveryState(
  database: pg.Client,
  phase: string,
  releasePolicy: string,
  targetAppRelease: string,
) {
  const state = await database.query<{
    phase: string;
    releasePolicy: string;
    rows: string;
    targetAppRelease: string;
    writesBlocked: boolean;
  }>(
    `SELECT gate."phase",
            gate."releasePolicy",
            gate."targetAppRelease",
            gate."writesBlocked",
            (${publicIdContractEntities
              .map(({ table }) => `(SELECT COUNT(*) FROM ${quotedIdentifier(table)})`)
              .join(" + ")})::bigint::text AS "rows"
       FROM "public_id_v3_write_gate" AS gate
      WHERE gate."id" IS TRUE`,
  );
  assert.deepEqual(state.rows[0], {
    phase,
    releasePolicy,
    rows: "0",
    targetAppRelease,
    writesBlocked: true,
  });
}

async function inFreshRecoverySchema(
  label: string,
  test: (database: pg.Client) => Promise<void>,
) {
  const schema = `${baseSchema}_${label}`;
  await db.query(`CREATE SCHEMA ${quotedIdentifier(schema)}`);
  try {
    await db.query(`SET search_path TO ${quotedIdentifier(schema)}`);
    await applySchemaBeforeV3Expand(db);
    await applyV3Migrations(db);
    await test(db);
  } finally {
    await db.query("RESET search_path");
    await db.query(`DROP SCHEMA IF EXISTS ${quotedIdentifier(schema)} CASCADE`);
  }
}

await db.connect();
try {
  await inFreshRecoverySchema("fresh_recovery", async (database) => {
    const migrationDb = database as unknown as PublicIdMigrationDatabase;
    const context = {
      phase: "public-id-v3-n1" as const,
      releasePolicy: "operator" as const,
      targetAppRelease: releaseN1,
    };
    await expectFreshRecoveryState(database, "public-id-v3-n", "automatic", "0".repeat(40));
    assert.deepEqual(
      await reblockPublicIdV3N1WriteGate(migrationDb, context, {
        allowFreshBlockedN: true,
      }),
      { installed: true, transitioned: false },
    );
    await expectFreshRecoveryState(database, "public-id-v3-n", "automatic", "0".repeat(40));

    await applyN1Contract(database);
    await expectFreshRecoveryState(database, "public-id-v3-n1", "automatic", "0".repeat(40));
    assert.deepEqual(
      await reblockPublicIdV3N1WriteGate(migrationDb, context, {
        allowFreshBlockedN: true,
      }),
      { installed: true, transitioned: true },
    );
    await expectFreshRecoveryState(database, "public-id-v3-n1", "operator", releaseN1);
    await cleanupPublicIdV3N1Artifacts(migrationDb, releaseN1, "operator");
    await assertFinalReadiness(database);
  });

  await inLegacySchema("cutover", async (database) => {
    const migrationDb = database as unknown as PublicIdMigrationDatabase;
    const first = await runPublicIdContractPrepare(migrationDb, { batchSize: 4 });
    assert.ok(first.migration.migrated > 0);
    assert.ok(first.migration.rewritten > 0);
    assert.equal(first.migration.revokedCredentials, 2);
    await assertPreparedV3(database);

    const retry = await runPublicIdContractPrepare(migrationDb, { batchSize: 4 });
    assert.equal(retry.migration.migrated, 0);
    assert.equal(retry.migration.rewritten, 0);
    assert.equal(retry.migration.revokedCredentials, 0);
    await assertPreparedV3(database);
    await enforceAndCleanN1(database);
  });

  await inLegacySchema("resume", async (database) => {
    const migrationDb = database as unknown as PublicIdMigrationDatabase;
    await assert.rejects(
      withPublicIdV3CutoverBypass(migrationDb, () =>
        migratePublicIds(migrationDb, { batchSize: 4, stopAfter: 5 }),
      ),
      /interrupted for resume testing/,
    );
    await runPublicIdContractPrepare(migrationDb, { batchSize: 4 });
    await assertPreparedV3(database);
  });

  await inLegacySchema("n1_post_release_session", async (database) => {
    const migrationDb = database as unknown as PublicIdMigrationDatabase;
    const postReleaseSession = {
      id: "session-post-release-n",
      publicId: "sid_b00000000000000000000000",
    };
    await runPublicIdContractPrepare(migrationDb, { batchSize: 4 });
    await releaseNWriteGate(database);
    await insertFixtureRow(
      database,
      "sessions",
      ["id", "publicId", "token", "expiresAt", "userId"],
      [
        postReleaseSession.id,
        postReleaseSession.publicId,
        "session-post-release-n-token",
        new Date("2030-01-01T00:00:00.000Z"),
        fixtureIds.user,
      ],
    );
    const ledgerBeforeN1 = await database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count"
         FROM "public_id_v3_migrations"
        WHERE "entityType" = 'session'
          AND "internalId" = $1`,
      [postReleaseSession.id],
    );
    assert.equal(ledgerBeforeN1.rows[0]?.count, 0);

    await reblockPublicIdV3N1WriteGate(migrationDb, {
      phase: "public-id-v3-n1",
      releasePolicy: "operator",
      targetAppRelease: releaseN1,
    });
    assert.deepEqual(
      await backfillPostReleasePublicIdLedger(
        migrationDb,
        {
          phase: "public-id-v3-n1",
          releasePolicy: "operator",
          targetAppRelease: releaseN1,
        },
        4,
      ),
      { eligible: true, reserved: 1 },
    );
    await applyN1Contract(database);

    const ledgerAfterN1 = await database.query<{
      migrated: boolean;
      newPublicId: string;
      oldExternalId: string | null;
    }>(
      `SELECT "oldExternalId",
              "newPublicId",
              ("migratedAt" IS NOT NULL) AS "migrated"
         FROM "public_id_v3_migrations"
        WHERE "entityType" = 'session'
          AND "internalId" = $1`,
      [postReleaseSession.id],
    );
    assert.deepEqual(ledgerAfterN1.rows[0], {
      migrated: true,
      newPublicId: postReleaseSession.publicId,
      oldExternalId: null,
    });
    await assertFinalReadiness(database);
    await cleanupPublicIdV3N1Artifacts(migrationDb, releaseN1, "operator");
    await assertFinalReadiness(database);
  });

  await inLegacySchema(
    "orphan_recovery",
    async (database) => {
      const migrationDb = database as unknown as PublicIdMigrationDatabase;
      await assert.rejects(
        runPublicIdContractPrepare(migrationDb, { batchSize: 4 }),
        /Missing .*public ID mappings/,
      );
      await applyV3AuditTombstonesMigration(database);
      await runPublicIdContractPrepare(migrationDb, { batchSize: 4 });
      await assertPreparedV3(database);
    },
    { auditTombstones: false },
  );

  await inLegacySchema("n1_null_guard", async (database) => {
    await runPublicIdContractPrepare(
      database as unknown as PublicIdMigrationDatabase,
      { batchSize: 4 },
    );
    await prepareBlockedN1(database);
    await database.query(
      `ALTER TABLE "users"
         DROP CONSTRAINT "users_public_id_contract_not_null"`,
    );
    await database.query(
      `ALTER TABLE "users" ALTER COLUMN "publicId" DROP NOT NULL`,
    );
    await database.query(
      `SELECT set_config(
         'bisibility.public_id_write_gate_bypass',
         'public-id-v3-n1',
         FALSE
       )`,
    );
    await database.query(
      `UPDATE "users" SET "publicId" = NULL WHERE "id" = $1`,
      [fixtureIds.user],
    );
    await database.query(
      `SELECT set_config('bisibility.public_id_write_gate_bypass', '', FALSE)`,
    );
    await assert.rejects(applyN1Contract(database), /NULL or malformed rows/);
    await database.query("ROLLBACK");
    const state = await database.query<{ blocked: boolean; nullable: string }>(
      `SELECT
         (SELECT "writesBlocked"
            FROM "public_id_v3_write_gate"
           WHERE "id" IS TRUE) AS "blocked",
         (SELECT is_nullable
            FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'users'
             AND column_name = 'publicId') AS "nullable"`,
    );
    assert.deepEqual(state.rows[0], { blocked: true, nullable: "YES" });
  });

  await inLegacySchema("n1_index_guard", async (database) => {
    await runPublicIdContractPrepare(
      database as unknown as PublicIdMigrationDatabase,
      { batchSize: 4 },
    );
    await prepareBlockedN1(database);
    await database.query(`DROP INDEX "users_publicId_key"`);
    await database.query(
      `CREATE UNIQUE INDEX "users_publicId_key" ON "users" ("id")`,
    );
    await assert.rejects(applyN1Contract(database), /invalid unique-index definition/);
    await database.query("ROLLBACK");
  });

  await inLegacySchema("n1_ledger_guard", async (database) => {
    await runPublicIdContractPrepare(
      database as unknown as PublicIdMigrationDatabase,
      { batchSize: 4 },
    );
    await prepareBlockedN1(database);
    await database.query(
      `SELECT set_config(
         'bisibility.public_id_write_gate_bypass',
         'public-id-v3-n1',
         FALSE
       )`,
    );
    await database.query(
      `UPDATE "public_id_v3_migrations"
          SET "migratedAt" = NULL
        WHERE "entityType" = 'user'
          AND "internalId" = $1`,
      [fixtureIds.user],
    );
    await database.query(
      `SELECT set_config('bisibility.public_id_write_gate_bypass', '', FALSE)`,
    );
    await assert.rejects(applyN1Contract(database), /ledger does not cover/);
    await database.query("ROLLBACK");
  });

  console.log(
    "Public ID v3 N+1 PostgreSQL cutover, contract guards, and cleanup harness passed.",
  );
} finally {
  await db.end();
}
