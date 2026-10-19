import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, type Prisma as PrismaTypes } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { readObservedResponse } from "@/lib/providers/usage";
import { PGlite } from "@electric-sql/pglite";
import type { MeterReserveInput } from "@usagekit/core";
import { vi } from "vitest";
import type { PaidAttemptContext } from "./paid-attempt-types";
import { ensureTimestampContract } from "./store/timestamp-history";

/** Real Store SQL with a valid credential binding and no project budget. */
export async function bindingBudgetFixture(
  source: "own" | "hosted",
  options: { migrationsRoot?: string } = {},
) {
  const db = new PGlite();
  await db.exec("SET TIME ZONE 'UTC'; CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY)");
  for (const name of [
    "20260924011626_metering_shadow",
    "20261006070000_metering_contract",
    "20261006072000_byok_metering_evidence",
    "20261006072500_byok_metering_namespace",
    "20261006072800_byok_metering_proof_revision",
    "20261006075800_metering_imports",
    "20261011010000_shared_paid_attempt_context",
    "20261011020000_accounting_history_snapshot",
    "20261012001000_metering_utc_writers",
  ])
    await db.exec(
      readFileSync(
        options.migrationsRoot
          ? join(options.migrationsRoot, name, "migration.sql")
          : new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url),
        "utf8",
      ),
    );
  const executor = {
    query: async <T>(query: { text: string; values: readonly unknown[] }) =>
      (await db.query<T>(query.text, [...query.values])).rows,
    execute: async (query: { text: string; values: readonly unknown[] }) =>
      (await db.query(query.text, [...query.values])).affectedRows ?? 0,
  };
  // A real empty-ledger audit installs its marker; no hand-written adoption proof.
  await db.exec("BEGIN");
  try {
    await ensureTimestampContract(executor);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    await db.close();
    throw error;
  }
  await db.exec(`CREATE TABLE projects(id text); INSERT INTO projects VALUES('project_1');
    CREATE TABLE provider_connections(id text); INSERT INTO provider_connections VALUES('connection_1');`);
  const connection = {
    id: "connection_1",
    projectId: "project_1",
    publicId: "public-connection",
    provider: "dataforseo",
    credentialSource: source,
    enabled: true,
    status: "connected",
    credentialsEncrypted: "encrypted-envelope",
    project: { ownerId: "owner" },
  };
  const tx = {
    $queryRaw: async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) =>
      executor.query(Array.isArray(query) ? Prisma.sql(query, ...values) : (query as Prisma.Sql)),
    $queryRawUnsafe: async (text: string, ...values: unknown[]) => executor.query({ text, values }),
    $executeRawUnsafe: async (text: string, ...values: unknown[]) =>
      executor.execute({ text, values }),
    $executeRaw: async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.isArray(query) ? Prisma.sql(query, ...values) : (query as Prisma.Sql);
      return executor.execute(sql);
    },
    providerConnection: { findUnique: vi.fn(async () => connection) },
    hostedProviderSelection: { findUnique: vi.fn(async () => null) },
    hostedProviderCredentialVersion: {
      findUnique: vi.fn(async () => ({
        id: "host-version",
        active: true,
        account: { id: "pool", provider: "dataforseo", costOwner: "payer" },
      })),
    },
  } as unknown as PrismaTypes.TransactionClient;
  const version =
    source === "hosted"
      ? "host-version"
      : ownCredentialVersion("dataforseo", connection.id, connection.credentialsEncrypted);
  if (!version) throw new Error("Fixture credential version is unavailable");
  const context: PaidAttemptContext = {
    projectId: connection.projectId,
    connectionId: connection.id,
    publicConnectionId: connection.publicId,
    providerCredentialVersion: version,
    correlationId: "rank-check",
    rankCheckId: "rank-check",
  };
  const reservation: MeterReserveInput = {
    operationId: "attempt",
    scope: {
      namespace: "default",
      principal: "owner",
      group: "project_1",
      connection: "connection_1",
      providerCredentialVersion: version,
    },
    fundingSource: source === "hosted" ? "platform" : "byok",
    costOwner: source === "hosted" ? "payer" : "owner",
    ...(source === "hosted" ? { platformPools: ["pool"] } : {}),
    source: "app",
    surface: "app",
    provider: "dataforseo",
    operation: "rank_check",
    estimate: [{ unit: "cents", value: 2n, scale: 0 }],
  };
  const request = vi.fn(async () => new Response("{}"));
  const observed = (verify: () => Promise<void>) =>
    readObservedResponse({
      observer: {
        begin: async () => {
          await verify();
          return "attempt";
        },
        settle: async () => {},
      },
      request,
      measure: () => ({ costCents: 2, quantity: 1, cached: false, failed: false }),
    });
  const budgets = async () => (await db.query("SELECT * FROM metering_budget")).rows;
  return {
    db,
    tx,
    context,
    reservation,
    request,
    observed,
    budgets,
    close: () => db.close(),
  };
}

export const missingProjectBudgetDenial = {
  name: "BudgetExhaustedError",
  code: "budget_exhausted",
  budget: {
    projectId: "project_1",
    capCents: 0,
    spentCents: 0,
    reservedCents: 0,
    reason: "budget_missing",
    resetAt: null,
  },
};
