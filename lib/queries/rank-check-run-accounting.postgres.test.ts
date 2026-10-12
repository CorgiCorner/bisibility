import { createUsageTables, seedTestUsage } from "@/lib/metering/usage.test-fixture";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ledgerActualCostCents,
  ledgerActualUnits,
  rankCheckLedgerActuals,
  rankCheckRunLedgerActuals,
  rankCheckRunTargetLedgerActuals,
} from "./rank-check-run-accounting";

type Receipt = {
  provider?: string;
  correlationId: string;
  costCents: number;
  projectId?: string;
  usageQuantity?: number | null;
  measurementStatus?: string;
  feature?: string;
  cached?: boolean;
  failed?: boolean;
};

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE rank_check_runs (id text PRIMARY KEY, "projectId" text NOT NULL);
    CREATE TABLE rank_checks (
      id text PRIMARY KEY,
      "runId" text NOT NULL REFERENCES rank_check_runs(id)
    );
    CREATE TABLE queued_rank_check_tasks (
      id text PRIMARY KEY,
      "rankCheckId" text NOT NULL REFERENCES rank_checks(id)
    );
  `);
  await createUsageTables(db);
});
afterEach(async () => {
  await db.close();
});

async function seedRun(id: string, projectId = "project_1") {
  await db.query(`INSERT INTO rank_check_runs (id, "projectId") VALUES ($1, $2)`, [id, projectId]);
}
async function seedCheck(id: string, runId: string) {
  await db.query(`INSERT INTO rank_checks (id, "runId") VALUES ($1, $2)`, [id, runId]);
}
async function seedTask(id: string, rankCheckId: string) {
  await db.query(`INSERT INTO queued_rank_check_tasks (id, "rankCheckId") VALUES ($1, $2)`, [
    id,
    rankCheckId,
  ]);
}
async function seedReceipt(entry: Receipt) {
  await seedTestUsage(db, entry);
}

function ledgerClient() {
  return {
    $queryRaw: async (query: { text: string; values: unknown[] }) =>
      (await db.query(query.text, query.values)).rows,
  };
}

async function runActuals(runIds: string[], projectId = "project_1") {
  const map = await rankCheckRunLedgerActuals(projectId, runIds, ledgerClient() as never);
  return map;
}

it.each(["run", "check", "target"] as const)(
  "%s accounting retains proven cached zero and rejects uncertain cache evidence",
  async (scope) => {
    const cases: { name: string; cache: Partial<Receipt>; confirmed: boolean }[] = [
      { name: "zero", cache: {}, confirmed: true },
      { name: "unknown", cache: { measurementStatus: "unknown" }, confirmed: false },
      { name: "null-quantity", cache: { usageQuantity: null }, confirmed: false },
      { name: "nonzero-cost", cache: { costCents: 9 }, confirmed: false },
      { name: "nonzero-quantity", cache: { usageQuantity: 1 }, confirmed: false },
    ];
    for (const scenario of cases) {
      for (const paid of [false, true]) {
        const id = `${scenario.name}-${paid}`;
        await seedRun(`run-${id}`);
        await seedCheck(`check-${id}`, `run-${id}`);
        await seedTask(`task-${id}`, `check-${id}`);
        await seedReceipt({
          correlationId: `task-${id}`,
          cached: true,
          costCents: 0,
          usageQuantity: 0,
          ...scenario.cache,
        });
        if (paid)
          await seedReceipt({ correlationId: `check-${id}`, costCents: 0.625, usageQuantity: 1 });
        const client = ledgerClient() as never;
        const actuals =
          scope === "run"
            ? await rankCheckRunLedgerActuals("project_1", [`run-${id}`], client)
            : scope === "check"
              ? await rankCheckLedgerActuals("project_1", [`check-${id}`], client)
              : await rankCheckRunTargetLedgerActuals("project_1", `run-${id}`, client);
        expect.soft(actuals.get(`${scope === "run" ? "run" : "check"}-${id}`), id).toMatchObject({
          costCents: scenario.confirmed ? (paid ? 0.625 : 0) : null,
          units: scenario.confirmed ? (paid ? 1 : 0) : null,
          receiptCount: paid ? 2 : 1,
          unconfirmedCount: scenario.confirmed ? 0 : 1,
        });
      }
    }
  },
);

describe("rank-check run ledger accounting SQL", () => {
  it("sums every paid attempt across a partial provider failure, including fallback receipts", async () => {
    await seedRun("run_1");
    await seedCheck("rc_partial", "run_1");
    await seedTask("task_partial", "rc_partial");
    await seedReceipt({ correlationId: "rc_partial", costCents: 0.625, usageQuantity: 1 });
    await seedReceipt({
      correlationId: "rc_partial",
      costCents: 0.625,
      usageQuantity: 1,
      failed: true,
    });
    await seedReceipt({
      correlationId: "task_partial",
      costCents: 0.25,
      usageQuantity: 1,
      failed: true,
    });

    const runs = await runActuals(["run_1"]);
    expect(runs.get("run_1")).toEqual({
      costCents: 1.5,
      receiptCount: 3,
      unitProvider: "serpapi",
      unconfirmedCount: 0,
      units: 3,
    });

    const targets = await rankCheckRunTargetLedgerActuals(
      "project_1",
      "run_1",
      ledgerClient() as never,
    );
    expect(targets.get("rc_partial")).toEqual({
      costCents: 1.5,
      receiptCount: 3,
      unitProvider: "serpapi",
      unconfirmedCount: 0,
      units: 3,
    });
  });

  it("counts live and queued correlations once each, without duplication or loss", async () => {
    await seedRun("run_1");
    await seedCheck("rc_both", "run_1");
    await seedTask("task_both", "rc_both");
    await seedReceipt({ correlationId: "rc_both", costCents: 0.5, usageQuantity: 1 });
    await seedReceipt({ correlationId: "task_both", costCents: 0.5, usageQuantity: 1 });

    const runs = await runActuals(["run_1"]);
    expect(runs.get("run_1")).toMatchObject({ costCents: 1, receiptCount: 2, units: 2 });

    const targets = await rankCheckRunTargetLedgerActuals(
      "project_1",
      "run_1",
      ledgerClient() as never,
    );
    expect(targets.get("rc_both")).toMatchObject({ costCents: 1, receiptCount: 2, units: 2 });
  });

  it("keeps a run with an unknown receipt unconfirmed instead of zero-filling", async () => {
    await seedRun("run_1");
    await seedRun("run_2");
    await seedCheck("rc_unknown", "run_2");
    await seedReceipt({
      correlationId: "rc_unknown",
      costCents: 0.4,
      measurementStatus: "unknown",
      usageQuantity: null,
    });

    const runs = await runActuals(["run_1", "run_2"]);
    expect(runs.has("run_1")).toBe(false);
    expect(runs.get("run_2")).toEqual({
      costCents: null,
      receiptCount: 1,
      unitProvider: "serpapi",
      unconfirmedCount: 1,
      units: null,
    });
    const ledger = runs.get("run_2");
    expect(ledgerActualCostCents(ledger, 7)).toBeNull();
    expect(ledgerActualUnits(ledger, 3)).toBeNull();
  });

  it("excludes foreign scopes but keeps inconsistent cache evidence unknown", async () => {
    await seedRun("run_1");
    await seedRun("run_2");
    await seedCheck("rc_zero", "run_1");
    await seedCheck("rc_other_run", "run_2");
    await seedReceipt({ correlationId: "rc_zero", costCents: 0, usageQuantity: 0 });
    await seedReceipt({
      correlationId: "rc_zero",
      costCents: 9,
      usageQuantity: 5,
      cached: true,
    });
    await seedReceipt({
      correlationId: "rc_zero",
      costCents: 3,
      projectId: "project_other",
    });
    await seedReceipt({ correlationId: "rc_zero", costCents: 3, feature: "search_sync" });
    await seedReceipt({ correlationId: "rc_other_run", costCents: 1 });

    const runs = await runActuals(["run_1"]);
    expect(runs.get("run_1")).toEqual({
      costCents: null,
      receiptCount: 2,
      unitProvider: "serpapi",
      unconfirmedCount: 1,
      units: null,
    });
    expect(ledgerActualCostCents(runs.get("run_1"), 5)).toBeNull();

    const targets = await rankCheckRunTargetLedgerActuals(
      "project_1",
      "run_1",
      ledgerClient() as never,
    );
    expect([...targets.keys()]).toEqual(["rc_zero"]);
    expect(ledgerActualUnits(targets.get("rc_zero"), 8)).toBeNull();
  });

  it("treats a recorded receipt without a quantity as unmeasured native usage", async () => {
    await seedRun("run_1");
    await seedCheck("rc_unmeasured", "run_1");
    await seedReceipt({ correlationId: "rc_unmeasured", costCents: 0.2, usageQuantity: null });

    const runs = await runActuals(["run_1"]);
    expect(runs.get("run_1")).toMatchObject({ costCents: 0.2, units: null });
    expect(ledgerActualUnits(runs.get("run_1"), 4)).toBeNull();
  });

  it("keeps missing canonical evidence unknown", async () => {
    await seedRun("run_1");
    await seedCheck("rc_legacy", "run_1");

    const runs = await runActuals(["run_1"]);
    expect(runs.size).toBe(0);
    expect(ledgerActualCostCents(undefined, 7)).toBeNull();
    expect(ledgerActualUnits(undefined, 4)).toBeNull();
    expect(ledgerActualUnits(undefined, null)).toBeNull();
  });

  it("does not add request quota to a different provider's task units", async () => {
    await seedRun("mixed");
    await seedCheck("rc", "mixed");
    await seedReceipt({ correlationId: "rc", provider: "serpapi", costCents: 0, usageQuantity: 2 });
    await seedReceipt({
      correlationId: "rc",
      provider: "dataforseo",
      costCents: 0.625,
      usageQuantity: 1,
    });
    expect((await runActuals(["mixed"])).get("mixed")).toMatchObject({
      costCents: 0.625,
      units: null,
    });
  });

  it("does not query when no runs are requested", async () => {
    const client = { $queryRaw: vi.fn() };
    const runs = await rankCheckRunLedgerActuals("project_1", [], client as never);
    expect(runs.size).toBe(0);
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("rank-check ledger accounting SQL (check-id scope)", () => {
  it("counts confirmed cached checks as zero without charging native replays twice", async () => {
    await seedRun("run_cache");
    for (const id of ["cached", "mixed", "missing"]) await seedCheck(id, "run_cache");
    await seedTask("cached_task", "cached");
    await seedReceipt({
      correlationId: "cached_task",
      cached: true,
      costCents: 0,
      usageQuantity: 0,
    });
    await seedReceipt({ correlationId: "mixed", costCents: 0.625, usageQuantity: 1 });
    await seedReceipt({ correlationId: "mixed", cached: true, costCents: 0, usageQuantity: 0 });
    await seedTestUsage(db, {
      id: "native-replay",
      correlationId: "mixed",
      costCents: 0,
      usageQuantity: 0,
    });
    await db.query(
      `UPDATE metering_receipt SET body = body || '{"metadata":{"chargeReplayed":true}}'::jsonb WHERE receipt_pk = 'native-replay'`,
    );

    const actuals = await rankCheckLedgerActuals(
      "project_1",
      ["cached", "mixed", "missing"],
      ledgerClient() as never,
    );
    expect(actuals.get("cached")).toMatchObject({ costCents: 0, units: 0, receiptCount: 1 });
    expect(actuals.get("mixed")).toMatchObject({ costCents: 0.625, units: 1 });
    expect(actuals.has("missing")).toBe(false);
  });

  it("keeps incomplete or inconsistent cached evidence unknown, even beside a paid receipt", async () => {
    await seedRun("run_cache_unknown");
    for (const id of ["unknown", "quantity", "nativeUnits", "cost", "mixed"])
      await seedCheck(id, "run_cache_unknown");
    await seedReceipt({
      correlationId: "unknown",
      cached: true,
      costCents: 0,
      usageQuantity: 0,
      measurementStatus: "unknown",
    });
    await seedReceipt({
      correlationId: "quantity",
      cached: true,
      costCents: 0,
      usageQuantity: null,
    });
    await seedReceipt({
      correlationId: "nativeUnits",
      cached: true,
      costCents: 0,
      usageQuantity: 1,
    });
    await seedReceipt({ correlationId: "cost", cached: true, costCents: 9, usageQuantity: 0 });
    await seedReceipt({ correlationId: "mixed", costCents: 0.625, usageQuantity: 1 });
    await seedReceipt({ correlationId: "mixed", cached: true, costCents: 0, usageQuantity: null });

    const actuals = await rankCheckLedgerActuals(
      "project_1",
      ["unknown", "quantity", "nativeUnits", "cost", "mixed"],
      ledgerClient() as never,
    );
    for (const id of ["unknown", "quantity", "nativeUnits", "cost", "mixed"]) {
      expect(actuals.get(id)).toMatchObject({ costCents: null, units: null, unconfirmedCount: 1 });
    }
  });

  it("totals paid partial failures across live and queued correlations for the requested checks", async () => {
    await seedRun("run_1");
    await seedCheck("rc_a", "run_1");
    await seedCheck("rc_b", "run_1");
    await seedTask("task_a", "rc_a");
    await seedReceipt({ correlationId: "rc_a", costCents: 0.625, usageQuantity: 1 });
    await seedReceipt({
      correlationId: "rc_a",
      costCents: 0.625,
      usageQuantity: 1,
      failed: true,
    });
    await seedReceipt({
      correlationId: "task_a",
      costCents: 0.25,
      usageQuantity: 1,
      failed: true,
    });
    await seedReceipt({ correlationId: "rc_b", costCents: 9, usageQuantity: 9 });

    const actuals = await rankCheckLedgerActuals(
      "project_1",
      ["rc_a", "rc_missing"],
      ledgerClient() as never,
    );
    expect([...actuals.keys()]).toEqual(["rc_a"]);
    expect(actuals.get("rc_a")).toEqual({
      costCents: 1.5,
      receiptCount: 3,
      unitProvider: "serpapi",
      unconfirmedCount: 0,
      units: 3,
    });
    expect(ledgerActualCostCents(actuals.get("rc_a"), 7)).toBe(1.5);
    expect(ledgerActualUnits(actuals.get("rc_a"), 7)).toBe(3);
  });

  it("keeps foreign scopes out and does not silently confirm inconsistent cached evidence", async () => {
    await seedRun("run_1");
    await seedCheck("rc_zero", "run_1");
    await seedCheck("rc_other", "run_1");
    await seedReceipt({ correlationId: "rc_zero", costCents: 0, usageQuantity: 0 });
    await seedReceipt({ correlationId: "rc_zero", costCents: 9, cached: true });
    await seedReceipt({
      correlationId: "rc_zero",
      costCents: 3,
      projectId: "project_other",
    });
    await seedReceipt({ correlationId: "rc_zero", costCents: 3, feature: "search_sync" });
    await seedReceipt({ correlationId: "rc_other", costCents: 1 });

    const actuals = await rankCheckLedgerActuals("project_1", ["rc_zero"], ledgerClient() as never);
    expect(actuals.get("rc_zero")).toEqual({
      costCents: null,
      receiptCount: 2,
      unitProvider: "serpapi",
      unconfirmedCount: 1,
      units: null,
    });
  });

  it("keeps an unknown receipt unconfirmed and mixed providers unitless", async () => {
    await seedRun("run_1");
    await seedCheck("rc_unknown", "run_1");
    await seedCheck("rc_mixed", "run_1");
    await seedReceipt({
      correlationId: "rc_unknown",
      costCents: 0.4,
      measurementStatus: "unknown",
      usageQuantity: null,
    });
    await seedReceipt({
      correlationId: "rc_mixed",
      provider: "serpapi",
      costCents: 0,
      usageQuantity: 2,
    });
    await seedReceipt({
      correlationId: "rc_mixed",
      provider: "dataforseo",
      costCents: 0.625,
      usageQuantity: 1,
    });

    const actuals = await rankCheckLedgerActuals(
      "project_1",
      ["rc_unknown", "rc_mixed"],
      ledgerClient() as never,
    );
    expect(actuals.get("rc_unknown")).toEqual({
      costCents: null,
      receiptCount: 1,
      unitProvider: "serpapi",
      unconfirmedCount: 1,
      units: null,
    });
    expect(actuals.get("rc_mixed")).toEqual({
      costCents: 0.625,
      receiptCount: 2,
      unitProvider: null,
      unconfirmedCount: 0,
      units: null,
    });
  });

  it("does not query when no checks are requested", async () => {
    const client = { $queryRaw: vi.fn() };
    const actuals = await rankCheckLedgerActuals("project_1", [], client as never);
    expect(actuals.size).toBe(0);
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });
});
