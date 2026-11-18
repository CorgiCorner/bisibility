import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { ModelProvider } from "@/lib/providers/model/types";
import { afterAll, afterEach, beforeEach, vi } from "vitest";
import * as admission from "./admission";
import { admitModelRun } from "./admission";
import {
  fixtureDdl,
  migrationSql,
  paymentMigrations,
  paymentSqlClient,
} from "./admission.postgres.test-support";
import { catalog, entry, result } from "./contract-fixtures.test-support";
import { applySqlScript, fixtureSchema, launchTestDatabase } from "./launch-database.test-support";
import { ModelAdmissionRefusal } from "./payment";
import { paymentContext } from "./payment.test-support";
import { prepareModelConnections, resolveModelPaymentContext } from "./preview";
import * as reports from "./report-finalize";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { createModelPlaygroundStore } from "./store";
import { migrations, routingMigration } from "./store.postgres.test-support";
import type { ModelColumnResult } from "./types";

export function launchHarness() {
  const sql = launchTestDatabase();
  const db = {
    $transaction: <T>(work: (tx: ReturnType<typeof paymentSqlClient>) => Promise<T>) =>
      sql.transaction((tx) => work(paymentSqlClient(tx))),
  } as unknown as Pick<PrismaClient, "$transaction">;
  const context = paymentContext();
  const input = structuredClone(context.input);
  input.columns[0].payment.optionId = `byok:${input.columns[0].connectionId}`;
  const calls: string[] = [];
  const now = new Date();
  let blocked = false;
  let failedColumn: string | null = null;
  let transform: ((answer: ModelColumnResult) => ModelColumnResult) | undefined;
  let paused: (() => Promise<void>) | undefined;
  const adapter: ModelProvider = {
    id: input.columns[0].providerId,
    probe: vi.fn(),
    async generate(_ctx, request, observer) {
      await observer.beforeDispatch(request.operationKey);
      calls.push(request.operationKey);
      await paused?.();
      const failed = request.column.columnId === failedColumn;
      const base: ModelColumnResult = {
        ...result(),
        column: request.column,
        providerRequestId: request.operationKey,
        startedAt: now.toISOString(),
        finishedAt: now.toISOString(),
        ...(failed
          ? {
              state: "failed" as const,
              failure: "provider_error" as const,
              answer: null,
              citations: [],
            }
          : {}),
      };
      const answer = transform?.(base) ?? base;
      await observer.settle(request.operationKey, answer);
      if (failed) throw new Error("Synthetic provider failure");
      return answer;
    },
  };
  const runtime: ModelPlaygroundRuntime = {
    entrySource: "app",
    db,
    now: () => now,
    authorize: vi.fn(async () => {
      if (blocked) throw new Error("Denied");
      return {
        actorId: context.actorId,
        projectId: context.projectId,
        principal: context.principal,
        namespace: context.namespace,
      };
    }),
    resolve: vi.fn(async (db, _projectId, request) => {
      const [row] = await db.$transaction(
        (tx: Prisma.TransactionClient) =>
          tx.$queryRaw<
            { credentialsEncrypted: string; enabled: boolean; credentialSource: string }[]
          >`SELECT "credentialsEncrypted",enabled,"credentialSource" FROM provider_connections LIMIT 1`,
      );
      if (!row.enabled || row.credentialSource !== "own")
        throw new ModelAdmissionRefusal("connection_unavailable");
      return {
        id: context.columns[0].binding.connectionId,
        apiKey: "synthetic-key",
        adapter,
        credentialVersion: ownCredentialVersion(
          request.providerId,
          context.columns[0].binding.connectionId,
          row.credentialsEncrypted,
        ) as string,
        accountDigest: "a".repeat(64),
        catalog: catalog({
          fetchedAt: now.toISOString(),
          expiresAt: new Date(+now + 300000).toISOString(),
          models: [entry({ capabilityVersion: "synthetic-v1" })],
        }),
      };
    }),
  };
  afterEach(() => {
    paused = undefined;
    Object.assign(input, structuredClone(context.input));
    input.columns[0].payment.optionId = `byok:${input.columns[0].connectionId}`;
    delete runtime.valuation;
    delete runtime.wait;
    delete runtime.onTerminal;
  });
  beforeEach(async () => {
    // Other launch fixtures omit report storage; never query an application database.
    vi.spyOn(reports, "finalizeModelPlaygroundReport").mockResolvedValue({
      ok: false,
      reason: "storage",
    });
    if (process.env.MODEL_LAUNCH_TEST_DATABASE_URL) vi.useRealTimers();
    calls.length = 0;
    blocked = false;
    failedColumn = null;
    paused = undefined;
    transform = undefined;
    input.columns = [structuredClone(context.input.columns[0])];
    input.columns[0].payment.optionId = `byok:${input.columns[0].connectionId}`;
    now.setTime(Date.now());
    await sql.exec(
      `DROP SCHEMA IF EXISTS ${fixtureSchema("launch_fixture")} CASCADE; CREATE SCHEMA ${fixtureSchema("launch_fixture")}; SET search_path TO ${fixtureSchema("launch_fixture")}; SET TIME ZONE 'UTC'; CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY);`,
    );
    now.setTime(+(await sql.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0].now);
    for (const name of paymentMigrations) await applySqlScript(sql, await migrationSql(name));
    await sql.exec(
      fixtureDdl.replace("CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY);", ""),
    );
    await sql.exec(
      `CREATE TABLE agent_reports(id text PRIMARY KEY,"projectId" text); CREATE TABLE ai_prompts(id text PRIMARY KEY,"projectId" text,UNIQUE("projectId",id)); CREATE UNIQUE INDEX provider_project_id ON provider_connections("projectId",id);`,
    );
    for (const name of [
      ...migrations.slice(1),
      routingMigration,
      "20261113190000_model_playground_paid_completion",
      "20261113193100_model_playground_retention_metadata",
      "20261113200000_model_playground_report_delete",
      "20261113200000_model_playground_worker_delivery",
      "20261113210000_model_playground_report_recovery",
      "20261113220000_model_playground_report_refresh",
      "20261113225000_model_playground_dispatch_finite",
    ])
      await applySqlScript(sql, await migrationSql(name));
    await sql.query(`INSERT INTO users VALUES('actor',NULL),($1,NULL)`, [context.principal]);
    await sql.query(`INSERT INTO projects(id,"ownerId") VALUES($1,$2)`, [
      context.projectId,
      context.principal,
    ]);
    await sql.query(`INSERT INTO memberships VALUES('member','actor',$1,'member')`, [
      context.projectId,
    ]);
    await sql.query(
      `INSERT INTO provider_connections VALUES($1,$2,$3,$4,'model','own','fixture-envelope',true,'connected')`,
      [
        context.columns[0].binding.connectionId,
        context.projectId,
        input.columns[0].connectionId,
        input.columns[0].providerId,
      ],
    );
    await db.$transaction(async (tx) => {
      await createTransactionBoundStore({ transaction: tx, clock: { now: () => now } });
      await saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
        id: `project:${context.projectId}:monthly`,
        version: 1,
        scope: { kind: "group", namespace: context.namespace, group: context.projectId },
        surface: "any",
        unit: "budget_cents",
        limit: null,
        onExceed: "block",
        window: { kind: "calendar_month", timezone: "UTC" },
      });
    });
  }, 30000);
  afterAll(() => sql.close());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No network in launch fixtures");
    }),
  );
  return {
    sql,
    async ageDispatches(milliseconds = 150_000) {
      // Fixture-only clock travel preserves production triggers for every tested operation.
      await sql.transaction(async (tx) => {
        await tx.query(
          "ALTER TABLE model_playground_payment_attempts DISABLE TRIGGER model_playground_payment_attempt_guard",
        );
        await tx.query(
          "UPDATE model_playground_payment_attempts SET dispatched_at=clock_timestamp()-($1*INTERVAL '1 millisecond') WHERE dispatched_at IS NOT NULL",
          [milliseconds],
        );
        await tx.query(
          "ALTER TABLE model_playground_payment_attempts ENABLE TRIGGER model_playground_payment_attempt_guard",
        );
      });
    },
    async expireLeases() {
      // A dead holder's lease has ended; recovery expires a fenced column only after that.
      await sql.query(
        `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second' WHERE "leaseExpiresAt" IS NOT NULL`,
      );
    },
    runtime,
    adapter,
    input,
    calls,
    now,
    context,
    async admitOnly(quote: { previewId: string; configHash: string }) {
      const access = await runtime.authorize("create");
      const connections = await prepareModelConnections(runtime, access, input);
      const outcome = await admitModelRun(
        db,
        {
          quoteId: quote.previewId,
          actorId: access.actorId,
          projectId: access.projectId,
          configHash: quote.configHash,
          consent: "non_guaranteed_estimate_v1",
        },
        {
          now: runtime.now,
          readCurrent: (tx, frozen) =>
            resolveModelPaymentContext(
              runtime,
              tx,
              access,
              frozen.context.input,
              connections,
              frozen,
            ),
        },
      );
      if (outcome.kind !== "admitted") throw new Error("Expected admission");
      return createModelPlaygroundStore(db).launch({
        version: 1,
        requestId: outcome.quoteId,
        previewId: outcome.quoteId,
        configHash: quote.configHash,
        projectId: access.projectId,
        actorId: access.actorId,
      });
    },
    answer: (fn: (answer: ModelColumnResult) => ModelColumnResult) => {
      transform = fn;
    },
    block: () => {
      blocked = true;
    },
    fail: (id: string) => {
      failedColumn = id;
    },
    pause: (callback: () => Promise<void>) => {
      paused = callback;
    },
  };
}

export function launchRequest(quote: {
  revision: string;
  previewId: string;
  quoteToken: string;
  configHash: string;
}) {
  return {
    revision: quote.revision,
    previewId: quote.previewId,
    quoteToken: quote.quoteToken,
    configHash: quote.configHash,
    version: 1 as const,
    requestId: crypto.randomUUID(),
    byokConsent: "non_guaranteed_estimate_v1" as const,
  };
}

export function addPrivateAdmissionFieldOnce() {
  const admit = admission.admitModelRun;
  return vi.spyOn(admission, "admitModelRun").mockImplementationOnce(async (...args) => ({
    ...(await admit(...args)),
    internalBinding: "server-only-fixture",
  }));
}
