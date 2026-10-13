import { expect, test } from "vitest";
import { source } from "./history-test-data";
import { runHistoricalImport, verifyHistoricalImport } from "./host-history-migration";
import { fundingSpendingBudgets } from "./spending-limits";
import { currentBudgets, saveBudget } from "./store/budgets";
import { Prisma, transactions } from "./store/host-sql";
import { fixture } from "./store/test-fixture";

const connection = {
  id: "connection",
  projectId: "project",
  provider: "dataforseo",
  allocationUnit: "cents",
  allocationAmountPerMonth: "10",
  programmaticAllocationAmountPerMonth: "20",
  creditsAllocationAmountPerMonth: "30",
  creditsProgrammaticAllocationAmountPerMonth: "40",
};

test("upgrades retained shadow and hosted budgets without overwriting their versions", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    const own = fundingSpendingBudgets(
      "test",
      { id: "connection", provider: "dataforseo", unit: "cents", app: "10", programmatic: "20" },
      "byok",
      1,
    );
    const platform = fundingSpendingBudgets(
      "test",
      { id: "connection", provider: "dataforseo", unit: "cents", app: "30", programmatic: "40" },
      "platform",
      1,
    );
    const legacy = [
      ...own.map((b) => ({ ...b, onExceed: "allow" as const })),
      ...platform.map((b) => ({
        ...b,
        scope: { kind: "connection" as const, namespace: "test", connection: "connection" },
      })),
    ];
    await tx.write(async (sql) => {
      for (const budget of legacy) await saveBudget(sql, budget);
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_setting_source VALUES('connection','connection',${JSON.stringify(connection)}::jsonb)`,
      );
    });
    await tx.write((sql) => runHistoricalImport(sql, "test", 10));
    await tx.read((sql) => verifyHistoricalImport(sql));
    expect(await tx.read((sql) => currentBudgets(sql, "test"))).toEqual(
      expect.arrayContaining([...own, ...platform].map((b) => ({ ...b, version: 2 }))),
    );
    const history = await tx.read((sql) =>
      sql.query(Prisma.sql`SELECT version FROM metering_budget WHERE version=1`),
    );
    expect(history).toHaveLength(4);
    await tx.write((sql) => runHistoricalImport(sql, "test", 10));
    expect(
      await tx.read((sql) => sql.query(Prisma.sql`SELECT version FROM metering_budget`)),
    ).toHaveLength(8);
  } finally {
    await f.close();
  }
});

test("retains the original BYOK namespace and nested credential version with migrated limits", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write(async (sql) => {
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source())}::jsonb)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_setting_source VALUES('connection','connection',${JSON.stringify(connection)}::jsonb)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_proof_source VALUES('byok','legacy','{"namespace":"retained","principal":"original","estimate":{"cents":"2","units":"2","credentialVersion":"original-key"}}'::jsonb)`,
      );
    });
    await tx.write((sql) => runHistoricalImport(sql, "test", 10));
    await tx.read((sql) => verifyHistoricalImport(sql));
    const op = await f.store.getOperation({
      namespace: "retained",
      principal: "original",
      operationId: "legacy:legacy",
    });
    expect(op?.scope.providerCredentialVersion).toBe("original-key");
    expect(
      op?.budgetEpochs.some((epoch) => epoch.budgetId === "own-connection:connection:app"),
    ).toBe(true);
  } finally {
    await f.close();
  }
});
