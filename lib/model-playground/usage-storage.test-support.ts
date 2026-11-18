import { readFile } from "node:fs/promises";
import { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, vi } from "vitest";
import { binding } from "./usage.test-support";

export function usageStorageHarness() {
  const db = new PGlite();
  function clientFor(sql: Pick<PGlite, "query">) {
    async function find(id: string) {
      return (
        (
          await sql.query<Record<string, unknown>>(
            "SELECT * FROM metering_usage_evidence WHERE id=$1",
            [id],
          )
        ).rows[0] ?? null
      );
    }
    const client = {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        const query = Prisma.sql(strings, ...values);
        return (await sql.query(query.text, query.values)).rows;
      },
      meteringUsageEvidence: {
        findUnique: async ({ where }: { where: { id: string } }) => find(where.id),
        async findFirst({
          where,
        }: {
          where: {
            connectionId: string;
            providerRequestId: string;
            id: { not: string };
            discarded: boolean;
          };
        }) {
          return (
            (
              await sql.query<{ payload: Record<string, unknown> }>(
                'SELECT * FROM metering_usage_evidence WHERE id<>$1 AND "connectionId"=$2 AND "providerRequestId"=$3 AND discarded=$4 ORDER BY id LIMIT 1',
                [
                  where.id.not,
                  where.connectionId,
                  where.providerRequestId,
                  String(where.discarded),
                ],
              )
            ).rows[0] ?? null
          );
        },
        async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
          const allowed = [
            "receipt",
            "estimate",
            "providerRequestId",
            "canonicalId",
            "proofVersion",
            "measurementStatus",
          ];
          const entries = Object.entries(data);
          if (entries.some(([key]) => !allowed.includes(key)))
            throw new Error("Unknown fixture column");
          const assignments = entries.map(([key], index) => `"${key}"=$${index + 2}`).join(",");
          const row = (
            await sql.query(
              `UPDATE metering_usage_evidence SET ${assignments} WHERE id=$1 RETURNING *`,
              [
                where.id,
                ...entries.map(([key, value]) =>
                  ["receipt", "estimate"].includes(key) ? JSON.stringify(value) : value,
                ),
              ],
            )
          ).rows[0];
          if (!row) throw new Error("Missing test row");
          return row;
        },
      },
    };
    return { client: client as unknown as Prisma.TransactionClient, find };
  }
  const { client: tx, find } = clientFor(db);
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Offline test attempted network");
      }),
    );
    await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    for (const migration of [
      "20261006072000_byok_metering_evidence",
      "20261006072500_byok_metering_namespace",
      "20261006072800_byok_metering_proof_revision",
    ])
      await db.exec(
        await readFile(
          new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          "utf8",
        ),
      );
    await seed();
  });
  afterAll(() => db.close());
  async function seed(id = "attempt-1", changes: Record<string, unknown> = {}) {
    const b = binding();
    const row = {
      id,
      namespace: "fixture",
      principal: b.principal,
      projectId: b.projectId,
      connectionId: b.connectionId,
      provider: b.column.providerId,
      feature: b.feature,
      source: b.source,
      estimate: {
        credentialVersion: b.credentialVersion,
        publicConnectionId: b.column.connectionId,
      },
      receipt: null,
      discarded: false,
      providerRequestId: null,
      canonicalId: null,
      proofVersion: 0,
      measurementStatus: "unknown",
      correlationId: "test-correlation",
      unit: "units",
      createdAt: new Date(),
      ...changes,
    };
    const entries = Object.entries(row);
    await db.query(
      `INSERT INTO metering_usage_evidence (${entries.map(([key]) => `"${key}"`).join(",")}) VALUES (${entries.map((_, index) => `$${index + 1}`).join(",")})`,
      entries.map(([key, value]) => (key === "estimate" ? JSON.stringify(value) : value)),
    );
  }
  return {
    db,
    tx,
    seed,
    find,
    transaction: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
      db.transaction((sql) => body(clientFor(sql).client)),
  };
}
