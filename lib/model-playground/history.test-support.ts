import { readFile } from "node:fs/promises";
import { makePublicId } from "@/lib/db/public-id-resources";
import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import { input, preview, result } from "./contract-fixtures.test-support";
import { applySqlScript, launchTestDatabase } from "./launch-database.test-support";
import { createModelPlaygroundStore } from "./store";
import type { ModelPlaygroundDatabase, ModelPlaygroundTransaction } from "./store-db";

export function historyHarness() {
  const schema = `mp_history_${crypto.randomUUID().replaceAll("-", "")}`;
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
    vi.stubEnv("TZ", "UTC");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("No network allowed");
      }),
    );
    await db.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"; SET TIME ZONE 'UTC';
      CREATE TYPE "ProviderKind" AS ENUM ('serp','analytics','enrichment');
      CREATE TYPE "ProviderCostFeature" AS ENUM ('rank_check','prompt_explorer');
      CREATE TABLE projects(id TEXT PRIMARY KEY,"writeMode" TEXT NOT NULL DEFAULT 'active');
      INSERT INTO projects(id) VALUES('project-a'),('project-b');
      CREATE TABLE provider_connections(id TEXT PRIMARY KEY,"publicId" TEXT UNIQUE,"projectId" TEXT REFERENCES projects(id),provider TEXT,kind "ProviderKind","credentialSource" TEXT,"credentialsEncrypted" TEXT,"updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,enabled BOOLEAN DEFAULT true,status TEXT DEFAULT 'connected',priority INT DEFAULT 100, UNIQUE("projectId",id),UNIQUE("projectId",provider));
      CREATE TABLE metering_paid_attempt_context(namespace TEXT,operation_id TEXT,context JSONB);
      CREATE TABLE metering_operation(namespace TEXT,operation_id TEXT,state TEXT);
      CREATE TABLE model_playground_payment_attempts(quote_id TEXT,root_quote_id TEXT,column_id TEXT,root_column_id TEXT,dispatched_at TIMESTAMPTZ,superseded_at TIMESTAMPTZ,binding JSONB DEFAULT '{}');
      CREATE TABLE ai_topics(id TEXT PRIMARY KEY,"publicId" TEXT UNIQUE,"projectId" TEXT,"archivedAt" TIMESTAMP);
      CREATE TABLE ai_prompts(id TEXT PRIMARY KEY,"publicId" TEXT UNIQUE,"projectId" TEXT REFERENCES projects(id),"topicId" TEXT,"archivedAt" TIMESTAMP,"pausedAt" TIMESTAMP,UNIQUE("projectId",id));
      CREATE TABLE ai_prompt_revisions(id TEXT PRIMARY KEY,"projectId" TEXT,"promptId" TEXT,ordinal INT,text TEXT);
      CREATE TABLE agent_reports(id TEXT PRIMARY KEY,"publicId" TEXT UNIQUE,"projectId" TEXT REFERENCES projects(id),kind TEXT,title TEXT,body JSONB,provenance JSONB,"createdById" TEXT,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE research_history_pins("userId" TEXT,"projectId" TEXT,surface TEXT,"itemKey" TEXT);
      CREATE TYPE "ResearchHistorySurface" AS ENUM ('model_playground');
      ALTER TABLE research_history_pins ALTER COLUMN surface TYPE "ResearchHistorySurface" USING surface::"ResearchHistorySurface";
      INSERT INTO ai_topics VALUES('topic-a','ait_aaaaaaaaaaaaaaaaaaaaaaaa','project-a',NULL),('topic-b','ait_bbbbbbbbbbbbbbbbbbbbbbbb','project-b',NULL);`);
    for (const name of [
      "20261111195133_model_provider_kind",
      "20261111195139_model_playground_runs",
      "20261111195343_model_playground_integrity",
      "20261111200000_model_playground_result_extensions",
      "20261112210000_model_playground_attempt_provenance",
      "20261112220000_model_playground_routing_settings",
      "20261113190000_model_playground_paid_completion",
      "20261113200000_model_playground_report_delete",
      "20261113210000_model_playground_report_recovery",
      "20261113220000_model_playground_report_refresh",
      "20261113225000_model_playground_dispatch_finite",
    ])
      await applySqlScript(
        db,
        await readFile(
          new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      `INSERT INTO provider_connections(id,"publicId","projectId",provider,kind,"credentialSource") VALUES('connection-a',$1,'project-a','openrouter','model','own')`,
      [input().columns[0].connectionId],
    );
  }, 60_000);
  afterAll(async () => {
    try {
      await db.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await db.close();
    }
  });
  afterEach(() => expect(fetch).not.toHaveBeenCalled());
  async function launch(terminal = true) {
    const snapshot = {
      ...preview(),
      previewId: crypto.randomUUID(),
      projectId: "project-a",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    await store.savePreview(snapshot, "actor-a");
    const run = await store.launch({
      version: 1,
      projectId: "project-a",
      actorId: "actor-a",
      requestId: crypto.randomUUID(),
      previewId: snapshot.previewId,
      configHash: snapshot.configHash,
    });
    if (terminal) {
      const lease = await store.claim({
        projectId: "project-a",
        runId: run.id,
        columnId: input().columns[0].columnId,
        leaseSeconds: 300,
      });
      if (!lease) throw new Error("No lease");
      const identity = {
        projectId: "project-a",
        runId: run.id,
        columnId: lease.columnId,
        leaseToken: lease.leaseToken,
      };
      await store.fenceDispatch(identity);
      await store.complete(identity, result());
    }
    return run;
  }
  async function createPrompt(
    tx: ModelPlaygroundTransaction,
    text: string,
    topicId: string | null,
  ) {
    const id = crypto.randomUUID();
    const publicId = makePublicId("aip");
    await tx.$queryRawUnsafe(
      `INSERT INTO ai_prompts(id,"publicId","projectId","topicId","pausedAt") VALUES($1,$2,'project-a',(SELECT id FROM ai_topics WHERE "publicId"=$3),CURRENT_TIMESTAMP)`,
      id,
      publicId,
      topicId,
    );
    await tx.$queryRawUnsafe(
      `INSERT INTO ai_prompt_revisions VALUES($1,'project-a',$2,1,$3)`,
      crypto.randomUUID(),
      id,
      text,
    );
    return { id, publicId };
  }
  return { db, database, store, launch, createPrompt };
}
