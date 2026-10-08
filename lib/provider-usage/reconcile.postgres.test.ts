import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileProviderUsage } from "./reconcile";

vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
vi.mock("@/lib/provider-usage/admission-extension", () => ({
  ownAdmission: { acknowledge: vi.fn(async () => false) },
}));
let db: PGlite;
const watermark = vi.fn();
// Cold PGlite startup and three retained-journal migrations can take more than 10 seconds.
beforeEach(async () => {
  watermark.mockReset();
  db = new PGlite();
  await db.exec(`
    CREATE TABLE provider_cost_entries (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "connectionId" text, "projectId" text, provider text, feature text,
      "keywordId" text, "correlationId" text, "providerRequestId" text,
      "credentialId" text, "credentialKind" text, source text, trigger text, tag text,
      "credentialSource" text NOT NULL DEFAULT 'own',
      "costCents" numeric NOT NULL, "usageQuantity" numeric, "unitCostCents" numeric,
      cached boolean NOT NULL, failed boolean NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT provider_cost_entries_usage_quantity_positive CHECK ("usageQuantity" IS NULL OR "usageQuantity" > 0)
    );
    CREATE UNIQUE INDEX request_identity ON provider_cost_entries ("connectionId", "providerRequestId") WHERE "providerRequestId" IS NOT NULL;
    CREATE TABLE queued_rank_check_batches (
      id text PRIMARY KEY, "connectionId" text, "projectId" text, provider text,
      "credentialId" text, "credentialKind" text, source text, trigger text, "submittedAt" timestamp
    );
    CREATE TABLE queued_rank_check_tasks (
      id text PRIMARY KEY, "batchId" text, "keywordId" text, "costCents" numeric,
      "providerTaskId" text, "providerTag" text, "createdAt" timestamp, "updatedAt" timestamp
    );
  `);
  await db.exec(
    readFileSync(
      new URL(
        "../../prisma/migrations/20260922040000_provider_usage_receipts/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const path of [
    "../../prisma/migrations/20261006072000_byok_metering_evidence/migration.sql",
    "../../prisma/migrations/20261006072500_byok_metering_namespace/migration.sql",
    "../../prisma/migrations/20261006072800_byok_metering_proof_revision/migration.sql",
  ])
    await db.exec(readFileSync(new URL(path, import.meta.url), "utf8"));
}, 30_000);
afterEach(async () => {
  await db.close();
});

function client(database: Pick<PGlite, "query"> = db) {
  return {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      db.transaction((tx) => work(client(tx))),
    meteringUsageEvidence: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        (await database.query(`SELECT * FROM metering_usage_evidence WHERE id=$1`, [where.id]))
          .rows[0] ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entries = Object.entries(data);
        return (
          await database.query(
            `UPDATE metering_usage_evidence SET ${entries.map(([key], i) => `"${key}"=$${i + 2}`).join(",")} WHERE id=$1 RETURNING *`,
            [
              where.id,
              ...entries.map(([key, value]) => (key === "receipt" ? JSON.stringify(value) : value)),
            ],
          )
        ).rows[0];
      },
    },
    $queryRaw: async (
      query: { text: string; values: unknown[] } | TemplateStringsArray,
      ...values: unknown[]
    ) => {
      const text =
        "text" in query
          ? query.text
          : query
              .map((part, index) => part + (index < values.length ? `$${index + 1}` : ""))
              .join("");
      return (await database.query(text, "text" in query ? query.values : values)).rows;
    },
    instanceSetting: { upsert: watermark },
    providerCostEntry: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        let count = 0;
        for (const record of data) {
          const entries = Object.entries(record).filter(([, value]) => value !== undefined);
          const result = await database.query(
            `INSERT INTO provider_cost_entries (${entries.map(([key]) => `"${key}"`).join(",")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT DO NOTHING RETURNING id`,
            entries.map(([, value]) => value),
          );
          count += result.rows.length;
        }
        return { count };
      },
      count: async ({
        where,
      }: {
        where: { measurementStatus: string; createdAt?: { lt: Date } };
      }) => {
        const result = await database.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM provider_cost_entries WHERE "measurementStatus"=$1 ${where.createdAt ? 'AND "createdAt" < $2' : ""}`,
          [where.measurementStatus, ...(where.createdAt ? [where.createdAt.lt] : [])],
        );
        return result.rows[0].count;
      },
      deleteMany: async ({ where }: { where: { id: string; measurementStatus: string } }) => {
        const result = await database.query(
          `DELETE FROM provider_cost_entries WHERE id=$1 AND "measurementStatus"=$2 RETURNING id`,
          [where.id, where.measurementStatus],
        );
        return { count: result.rows.length };
      },
      findFirst: async ({
        where,
      }: {
        where: { connectionId?: string; providerRequestId?: string; id?: { not: string } };
      }) => {
        if (!where.providerRequestId) return null;
        return (
          (
            await database.query(
              `SELECT id, "measurementStatus", "costCents", "usageQuantity", cached, failed FROM provider_cost_entries WHERE "connectionId"=$1 AND "providerRequestId"=$2 AND id<>$3`,
              [where.connectionId, where.providerRequestId, where.id?.not],
            )
          ).rows[0] ?? null
        );
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entries = Object.entries(data).filter(([, value]) => value !== undefined);
        try {
          const result = await database.query(
            `UPDATE provider_cost_entries SET ${entries.map(([key], index) => `"${key}"=$${index + 2}`).join(",")} WHERE id=$1 RETURNING id`,
            [where.id, ...entries.map(([, value]) => value)],
          );
          if (result.rows.length === 0)
            throw Object.assign(new Error("Record not found."), { code: "P2025" });
          return result.rows[0];
        } catch (error) {
          if (String(error).includes("request_identity")) {
            throw Object.assign(new Error("Unique constraint failed."), { code: "P2002" });
          }
          throw error;
        }
      },
    },
  };
}
async function seed(count: number) {
  await db.exec(`
    INSERT INTO queued_rank_check_batches (id, "connectionId", "projectId", provider, source, trigger, "submittedAt")
    VALUES ('b1','c1','p1','dataforseo','mcp','manual','2026-08-31 23:59:00');
    INSERT INTO queued_rank_check_tasks (id, "batchId", "keywordId", "costCents", "providerTaskId", "providerTag", "createdAt", "updatedAt")
    SELECT 't'||n,'b1','deleted-keyword',0.625,'request-'||n,'trusted;cs=own;tag','2026-08-31 23:58:00','2026-09-22 12:00:00'
    FROM generate_series(1,${count}) n;
  `);
}

describe("provider receipt SQL and migration", () => {
  it("updates a preexisting original-owner journal through the neutral PostgreSQL port", async () => {
    await seed(1);
    await db.exec(`INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents",cached,failed,"measurementStatus")
      VALUES ('pending-proof','c1','p1','rank_check','t1',0,false,false,'unknown');
      INSERT INTO metering_usage_evidence (id,namespace,principal,"projectId","connectionId",provider,feature,source,"correlationId",unit,estimate,"createdAt")
      VALUES ('pending-proof','retained-namespace','original-owner','p1','c1','dataforseo','rank_check','mcp','t1','cents','{}','2026-08-31 23:57:00');`);
    expect(await reconcileProviderUsage(client() as never)).toMatchObject({ reconciled: 1 });
    const evidence = await db.query(
      `SELECT principal,namespace,"proofVersion",receipt FROM metering_usage_evidence WHERE id='pending-proof'`,
    );
    expect(evidence.rows[0]).toMatchObject({
      principal: "original-owner",
      namespace: "retained-namespace",
      proofVersion: 1,
      receipt: { costCents: "0.6250", quantity: "1.000000" },
    });
  });
  it("permits confirmed zero, rejects negative usage and invalid measurement states", async () => {
    await db.exec(
      `INSERT INTO provider_cost_entries ("costCents","usageQuantity",cached,failed) VALUES (0,0,true,false)`,
    );
    await expect(
      db.exec(
        `INSERT INTO provider_cost_entries ("costCents","usageQuantity",cached,failed) VALUES (0,-1,false,false)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `INSERT INTO provider_cost_entries ("costCents",cached,failed,"measurementStatus") VALUES (0,false,false,'guessed')`,
      ),
    ).rejects.toThrow();
  });
  it("drains more than three batches, preserves billing month and is idempotent", async () => {
    await seed(351);
    const fixture = client();
    for (let batch = 0; batch < 4; batch += 1) {
      const result = await reconcileProviderUsage(fixture as never);
      expect(result.hasMore).toBe(batch < 3);
      expect(result.reconciled).toBe(batch < 3 ? 100 : 51);
      expect(watermark).toHaveBeenCalledTimes(batch < 3 ? 0 : 1);
    }
    const sums = await db.query(
      `SELECT count(*)::int AS count, sum("costCents")::float AS cost, sum("usageQuantity")::float AS quantity, min("createdAt") AS earliest, max("createdAt") AS latest FROM provider_cost_entries`,
    );
    expect(sums.rows[0]).toMatchObject({ count: 351, cost: 219.375, quantity: 351 });
    expect(String((sums.rows[0] as { earliest: Date }).earliest)).toContain("Aug 31 2026");
    expect(await reconcileProviderUsage(fixture as never)).toMatchObject({
      reconciled: 0,
      hasMore: false,
    });
  });
  it("settles a pending unknown receipt once and keeps its original billing timestamp", async () => {
    await seed(1);
    await db.exec(
      `INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents",cached,failed,"createdAt","measurementStatus")
       VALUES ('entry_1','c1','p1','rank_check','t1',0,false,false,'2026-08-31 23:57:00','unknown')`,
    );
    const fixture = client();
    const first = await reconcileProviderUsage(fixture as never);
    expect(first).toMatchObject({ hasMore: false, reconciled: 1, scanned: 1, unconfirmed: 0 });
    const settled = await db.query<{
      costCents: number;
      createdAt: string;
      measurementStatus: string;
      providerRequestId: string;
      usageQuantity: number;
    }>(
      `SELECT "costCents"::float AS "costCents", "createdAt", "measurementStatus", "providerRequestId", "usageQuantity"::float AS "usageQuantity" FROM provider_cost_entries WHERE id='entry_1'`,
    );
    expect(settled.rows[0]).toMatchObject({
      costCents: 0.625,
      measurementStatus: "recorded",
      providerRequestId: "request-1",
      usageQuantity: 1,
    });
    expect(String(settled.rows[0].createdAt)).toContain("Aug 31 2026");
    const second = await reconcileProviderUsage(fixture as never);
    expect(second).toMatchObject({ reconciled: 0, scanned: 0, unconfirmed: 0 });
    const total = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM provider_cost_entries`,
    );
    expect(total.rows).toEqual([{ count: 1 }]);
  });
  it("removes a phantom pending receipt once its native ledger row exists", async () => {
    await seed(1);
    await db.exec(
      `INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents","usageQuantity",cached,failed,"createdAt","measurementStatus","providerRequestId")
       VALUES ('recorded_1','c1','p1','rank_check','t1',0.625,1,false,false,'2026-08-31 23:57:00','recorded','request-1')`,
    );
    await db.exec(
      `INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents",cached,failed,"createdAt","measurementStatus")
       VALUES ('entry_pending','c1','p1','rank_check','t1',0,false,false,'2026-08-31 23:58:00','unknown')`,
    );
    const fixture = client();
    const result = await reconcileProviderUsage(fixture as never);
    expect(result).toMatchObject({ hasMore: false, reconciled: 1, scanned: 1, unconfirmed: 0 });
    const rows = await db.query<{ id: string }>(`SELECT id FROM provider_cost_entries ORDER BY id`);
    expect(rows.rows).toEqual([{ id: "recorded_1" }]);
    const again = await reconcileProviderUsage(fixture as never);
    expect(again).toMatchObject({ reconciled: 0, scanned: 0, unconfirmed: 0 });
  });
  it("settles an existing unknown native receipt instead of dropping its recovered charge", async () => {
    await seed(1);
    await db.exec(`INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents",cached,failed,"measurementStatus","providerRequestId") VALUES
      ('old','c1','p1','rank_check','older-correlation',0,false,true,'unknown','request-1'),
      ('pending','c1','p1','rank_check','t1',0,false,false,'unknown',NULL)`);
    const result = await reconcileProviderUsage(client() as never);
    expect(result.unconfirmed).toBe(0);
    expect(
      (
        await db.query(
          `SELECT "costCents"::float AS cost,"measurementStatus" AS status FROM provider_cost_entries`,
        )
      ).rows,
    ).toEqual([{ cost: 0.625, status: "recorded" }]);
  });
  it("does not keep draining unresolvable duplicate unknown receipts", async () => {
    await seed(2);
    await db.exec(`UPDATE queued_rank_check_tasks SET "costCents"=NULL;
      INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents",cached,failed,"measurementStatus","providerRequestId")
      SELECT 'old'||n,'c1','p1','rank_check','older'||n,0,false,false,'unknown','request-'||n FROM generate_series(1,2) n;
      INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents",cached,failed,"measurementStatus")
      SELECT 'pending'||n,'c1','p1','rank_check','t'||n,0,false,false,'unknown' FROM generate_series(1,2) n;`);
    expect(await reconcileProviderUsage(client() as never, { limit: 1 })).toMatchObject({
      scanned: 0,
      reconciled: 0,
      hasMore: false,
      unconfirmed: 4,
    });
  });

  it("uses one shared batch budget across pending settlement and missing receipts", async () => {
    await seed(150);
    await db.exec(`INSERT INTO provider_cost_entries (id,"connectionId","projectId",feature,"correlationId","costCents",cached,failed,"measurementStatus")
      SELECT 'pending'||n,'c1','p1','rank_check','t'||n,0,false,false,'unknown' FROM generate_series(1,75) n`);
    const result = await reconcileProviderUsage(client() as never);
    expect(result).toMatchObject({ reconciled: 100, scanned: 100, hasMore: true });
    expect(watermark).not.toHaveBeenCalled();
    expect(await reconcileProviderUsage(client() as never)).toMatchObject({
      reconciled: 50,
      hasMore: false,
    });
  });

  it("deduplicates native identities within a connection without dropping another connection's receipt", async () => {
    await seed(1);
    await db.exec(
      `INSERT INTO provider_cost_entries ("connectionId","providerRequestId","costCents","usageQuantity",cached,failed) VALUES ('c2','request-1',0.625,1,false,false)`,
    );
    const fixture = client();
    expect(await reconcileProviderUsage(fixture as never)).toMatchObject({ reconciled: 1 });
    expect(await reconcileProviderUsage(fixture as never)).toMatchObject({ reconciled: 0 });
    const result = await db.query(`SELECT count(*)::int AS count FROM provider_cost_entries`);
    expect(result.rows).toEqual([{ count: 2 }]);
  });
});
