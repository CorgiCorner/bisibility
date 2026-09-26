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
    CREATE TABLE provider_cost_entries (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "projectId" text NOT NULL,
      provider text NOT NULL DEFAULT 'serpapi',
      feature text NOT NULL DEFAULT 'rank_check',
      "correlationId" text,
      "costCents" numeric NOT NULL,
      "usageQuantity" numeric,
      "measurementStatus" text NOT NULL DEFAULT 'recorded',
      cached boolean NOT NULL DEFAULT false,
      failed boolean NOT NULL DEFAULT false,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT provider_cost_entries_measurement_status_check
        CHECK ("measurementStatus" IN ('recorded', 'unknown')),
      CONSTRAINT provider_cost_entries_usage_quantity_check
        CHECK ("usageQuantity" IS NULL OR "usageQuantity" >= 0)
    );
  `);
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
  await db.query(
    `INSERT INTO provider_cost_entries
      ("projectId", feature, "correlationId", "costCents", "usageQuantity", "measurementStatus", cached, failed, provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.projectId ?? "project_1",
      entry.feature ?? "rank_check",
      entry.correlationId,
      entry.costCents,
      entry.usageQuantity ?? null,
      entry.measurementStatus ?? "recorded",
      entry.cached ?? false,
      entry.failed ?? false,
      entry.provider ?? "serpapi",
    ],
  );
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

  it("excludes cached, foreign-project, foreign-feature, and other-run receipts while retaining explicit zero", async () => {
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
      costCents: 0,
      receiptCount: 1,
      unitProvider: "serpapi",
      unconfirmedCount: 0,
      units: 0,
    });
    expect(ledgerActualCostCents(runs.get("run_1"), 5)).toBe(0);

    const targets = await rankCheckRunTargetLedgerActuals(
      "project_1",
      "run_1",
      ledgerClient() as never,
    );
    expect([...targets.keys()]).toEqual(["rc_zero"]);
    expect(ledgerActualUnits(targets.get("rc_zero"), 8)).toBe(0);
  });

  it("treats a recorded receipt without a quantity as unmeasured native usage", async () => {
    await seedRun("run_1");
    await seedCheck("rc_unmeasured", "run_1");
    await seedReceipt({ correlationId: "rc_unmeasured", costCents: 0.2, usageQuantity: null });

    const runs = await runActuals(["run_1"]);
    expect(runs.get("run_1")).toMatchObject({ costCents: 0.2, units: null });
    expect(ledgerActualUnits(runs.get("run_1"), 4)).toBeNull();
  });

  it("falls back to stored measurements only when the ledger has no receipts", async () => {
    await seedRun("run_1");
    await seedCheck("rc_legacy", "run_1");

    const runs = await runActuals(["run_1"]);
    expect(runs.size).toBe(0);
    expect(ledgerActualCostCents(undefined, 7)).toBe(7);
    expect(ledgerActualUnits(undefined, 4)).toBe(4);
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

  it("keeps a requested check isolated from other checks, cached, foreign-project, and foreign-feature receipts", async () => {
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
      costCents: 0,
      receiptCount: 1,
      unitProvider: "serpapi",
      unconfirmedCount: 0,
      units: 0,
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
