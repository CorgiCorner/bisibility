import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import { connectionId, preview, result } from "./contract-fixtures.test-support";
import { applySqlScript, launchTestDatabase } from "./launch-database.test-support";
import { createModelPlaygroundStore } from "./store";
import type { ModelPlaygroundDatabase } from "./store-db";

export const internalConnectionId = "cmr00000000000000000000001";

export const migrations = [
  "20261111195133_model_provider_kind",
  "20261111195139_model_playground_runs",
  "20261111195343_model_playground_integrity",
  "20261111200000_model_playground_result_extensions",
  "20261112210000_model_playground_attempt_provenance",
];

export const routingMigration = "20261112220000_model_playground_routing_settings";

export function createHarness(includeResultExtensions = true) {
  const schema = process.env.MODEL_LAUNCH_TEST_DATABASE_URL
    ? `mp_store_${crypto.randomUUID().replaceAll("-", "")}`
    : "public";
  const db = launchTestDatabase(process.env.MODEL_LAUNCH_TEST_DATABASE_URL, schema);
  const database: ModelPlaygroundDatabase = {
    $transaction: (work) =>
      db.transaction((tx) =>
        work({
          $queryRawUnsafe: async <T>(sql: string, ...args: unknown[]) =>
            (await tx.query<T>(sql, args)).rows,
        }),
      ),
  };
  const store = createModelPlaygroundStore(database);
  beforeEach(async () => {
    vi.useRealTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Unexpected network");
      }),
    );
    await db.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"; SET TIME ZONE 'UTC';
      CREATE TYPE "ProviderKind" AS ENUM ('serp','analytics','enrichment');
      CREATE TYPE "ProviderCostFeature" AS ENUM ('rank_check','prompt_explorer');
      CREATE TABLE projects(id TEXT PRIMARY KEY);
      CREATE TABLE provider_connections(id TEXT PRIMARY KEY,"publicId" TEXT NOT NULL UNIQUE,"projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,kind "ProviderKind" NOT NULL,"credentialSource" TEXT NOT NULL DEFAULT 'own',
        "credentialsEncrypted" TEXT,"updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        enabled BOOLEAN NOT NULL DEFAULT true,status TEXT NOT NULL DEFAULT 'connected',priority INT NOT NULL DEFAULT 100,
        UNIQUE("projectId",id),UNIQUE("projectId",provider));
      CREATE TABLE metering_paid_attempt_context(namespace TEXT,operation_id TEXT,context JSONB);
      CREATE TABLE metering_operation(namespace TEXT,operation_id TEXT,state TEXT);
      CREATE TABLE ai_prompts(id TEXT PRIMARY KEY,"projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,UNIQUE("projectId",id));
      CREATE TABLE agent_reports(id TEXT PRIMARY KEY,"projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE);
      CREATE TABLE keyword_schedules(id TEXT PRIMARY KEY,enabled BOOLEAN);
      CREATE TABLE rank_checks(id TEXT PRIMARY KEY);
      INSERT INTO projects VALUES('project-a'),('project-b');
      INSERT INTO ai_prompts VALUES('prompt-a','project-a'),('prompt-b','project-b');
      INSERT INTO agent_reports VALUES('report-a','project-a'),('report-a2','project-a'),('report-b','project-b');
      INSERT INTO keyword_schedules VALUES('existing-schedule',true); INSERT INTO rank_checks VALUES('existing-history');`);
    for (const migration of [
      ...migrations,
      ...(includeResultExtensions
        ? [
            routingMigration,
            "20261113193100_model_playground_retention_metadata",
            "20261117190000_model_playground_credit_shapes",
          ]
        : []),
    ]) {
      if (!includeResultExtensions && migration === migrations.at(-1)) continue;
      await applySqlScript(
        db,
        await readFile(
          new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          "utf8",
        ),
      );
    }
    await db.query(
      `INSERT INTO provider_connections(id,"publicId","projectId",provider,kind,"credentialSource","credentialsEncrypted")
      VALUES($1,$2,'project-a','openrouter','model','own','encrypted-fixture-key'),
      ('cmr00000000000000000000002','conn_bbbbbbbbbbbbbbbbbbbbbbbb','project-b','openrouter','model','own','encrypted-fixture-key'),
      ('cmr00000000000000000000003','conn_cccccccccccccccccccccccc','project-a','openai','model','own','encrypted-fixture-key'),
      ('cmr00000000000000000000004','conn_dddddddddddddddddddddddd','project-a','anthropic','model','hosted',NULL)`,
      [internalConnectionId, connectionId],
    );
  });
  afterAll(async () => {
    try {
      await db.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await db.close();
    }
  });
  afterEach(() => expect(fetch).not.toHaveBeenCalled());
  function snapshot() {
    return {
      ...preview(),
      projectId: "project-a",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }
  async function launch(value = snapshot()) {
    await store.savePreview(value, "actor-a");
    return store.launch({
      version: 1,
      projectId: "project-a",
      actorId: "actor-a",
      requestId: crypto.randomUUID(),
      previewId: value.previewId,
      configHash: value.configHash,
    });
  }
  const evidence = () => ({
    ...result(),
    actualProviderId: "upstream/vendor",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
  return { db, store, snapshot, launch, evidence };
}

export function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected retained fixture value");
  return value;
}
