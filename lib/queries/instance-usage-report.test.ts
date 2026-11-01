import type { Prisma } from "@/lib/generated/prisma/client";
import { createUsageTables, seedTestUsage } from "@/lib/metering/usage.test-fixture";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { instanceUsagePeriod } from "./instance-usage-period";
import { readInstanceUsageReport } from "./instance-usage-report";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "default" }));
const db = new PGlite();
const tx = {
  $queryRaw: async (sql: { text: string; values: unknown[] }) =>
    (await db.query(sql.text, sql.values)).rows,
} as unknown as Pick<Prisma.TransactionClient, "$queryRaw">;
const now = new Date("2026-10-28T20:00:00Z");
beforeEach(async () => {
  await db.exec(
    "DROP TABLE IF EXISTS metering_measurement,metering_receipt,metering_paid_attempt_context,metering_operation",
  );
  await createUsageTables(db);
});
afterAll(() => db.close());

test("defaults to all history and includes non-SERP costs without a live project join", async () => {
  await seedTestUsage(db, {
    id: "old",
    projectId: "deleted",
    feature: "keyword_research",
    costCents: 600,
    createdAt: "2026-08-02T00:00:00Z",
  });
  await seedTestUsage(db, {
    id: "current",
    feature: "backlinks",
    costCents: 20,
    createdAt: "2026-10-02T00:00:00Z",
  });
  expect(instanceUsagePeriod(undefined)).toBe("all");
  const all = await readInstanceUsageReport(tx, "default", "all", now);
  expect(all.totals).toEqual({
    operations: 2,
    recordedOperations: 2,
    unknownOperations: 0,
    costUsdUnits: "6200000",
  });
  expect(all.topProjects[0]).toMatchObject({ projectId: "deleted", costUsdUnits: "6000000" });
  const month = await readInstanceUsageReport(tx, "default", "month", now);
  expect(month.totals.costUsdUnits).toBe("200000");
  expect(month.totals.operations).toBe(1);
});

test("counts a correction once and preserves unknown cost separately from measured zero", async () => {
  await seedTestUsage(db, { id: "corrected", costCents: 100 });
  await db.query(
    "INSERT INTO metering_receipt VALUES('new','corrected','new',1,'{}',now(),'measured',2500000)",
  );
  await seedTestUsage(db, { id: "unknown", provider: "dataforseo", measurementStatus: "unknown" });
  await seedTestUsage(db, { id: "free", costCents: 0 });
  const report = await readInstanceUsageReport(tx, "default", "all", new Date("2099-01-01"));
  expect(report.totals).toEqual({
    operations: 3,
    recordedOperations: 2,
    unknownOperations: 1,
    costUsdUnits: "2500000",
  });
  expect(report.providers.find((row) => row.provider === "dataforseo")).toMatchObject({
    costUsdUnits: null,
    unknownOperations: 1,
  });
});

test("bounds only top projects while provider and instance totals include the complete namespace", async () => {
  for (let i = 0; i < 12; i++)
    await seedTestUsage(db, {
      projectId: `project_${i}`,
      costCents: 100,
      createdAt: "2026-10-01T00:00:00Z",
    });
  await seedTestUsage(db, { id: "other", costCents: 9999 });
  await db.query("UPDATE metering_operation SET namespace='other' WHERE operation_id='other'");
  const report = await readInstanceUsageReport(tx, "default", "all", now);
  expect(report.topProjects).toHaveLength(10);
  expect(report.totals.operations).toBe(12);
  expect(report.totals.costUsdUnits).toBe("12000000");
  expect(report.providers[0].operations).toBe(12);
  expect(report.topProjects[0].sharePercent).toBe(8.33);
});

test("excludes unsent reservations, unfenced dispatches and future records", async () => {
  for (const id of ["reserved", "unfenced", "future"])
    await seedTestUsage(db, {
      id,
      costCents: 600,
      createdAt: id === "future" ? "2026-11-01T00:00:00Z" : "2026-10-01T00:00:00Z",
    });
  await db.query("UPDATE metering_operation SET state='pending' WHERE operation_id='reserved'");
  await db.query(
    "UPDATE metering_operation SET state='dispatch_intended' WHERE operation_id='unfenced'",
  );
  const report = await readInstanceUsageReport(tx, "default", "all", now);
  expect(report.totals.operations).toBe(0);
});

test("keeps fenced unknown requests in financial coverage after operational closure", async () => {
  await seedTestUsage(db, {
    id: "sent-unknown",
    measurementStatus: "unknown",
    createdAt: "2026-10-01T00:00:00Z",
  });
  await db.query(
    "UPDATE metering_operation SET state='dispatch_intended' WHERE operation_id='sent-unknown'",
  );
  await db.query(
    "UPDATE metering_paid_attempt_context SET fenced_at=now() WHERE operation_id='sent-unknown'",
  );
  await db.query("DELETE FROM metering_receipt WHERE operation_pk='sent-unknown'");
  const report = await readInstanceUsageReport(tx, "default", "all", now);
  expect(report.totals).toEqual({
    operations: 1,
    recordedOperations: 0,
    unknownOperations: 1,
    costUsdUnits: null,
  });
});
