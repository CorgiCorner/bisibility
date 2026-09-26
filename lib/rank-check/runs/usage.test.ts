import { describe, expect, it } from "vitest";
import { type RunLedgerActual, type RunUsageGroup, runUsage } from "./usage";

const run = { selectionSpec: { providerId: "serpapi" }, startedTargets: 2, targetCount: 2 };
const group: RunUsageGroup = {
  runId: "run_example",
  provider: "serpapi",
  requestedDepth: 20,
  _count: { _all: 2, billingUnits: 0 },
  _sum: { billingUnits: null },
};

const confirmedLedger: RunLedgerActual = {
  costCents: 0.925,
  receiptCount: 2,
  unitProvider: "serpapi",
  unconfirmedCount: 0,
  units: 2,
};

describe("run operation usage", () => {
  it("does not label another provider's recorded tasks as the launched provider's searches", () => {
    expect(
      runUsage(run, [group], { ...confirmedLedger, unitProvider: "dataforseo" })?.actual,
    ).toBeNull();
  });
  it("keeps missing historical depth estimates unknown", () => {
    expect(runUsage(run, [{ ...group, requestedDepth: null }])?.estimated).toBeNull();
  });
  it("keeps failed unrecorded requests unknown while recovering the depth estimate", () => {
    expect(runUsage(run, [group])).toEqual({ actual: null, estimated: 4, unit: "operations" });
  });
  it("uses recorded operations, including early-stop usage, instead of cost or depth", () => {
    expect(
      runUsage(run, [
        { ...group, _count: { _all: 2, billingUnits: 2 }, _sum: { billingUnits: 3 } },
      ]),
    ).toEqual({ actual: 3, estimated: 4, unit: "operations" });
  });
  it("does not present a partial aggregate as total actual usage", () => {
    expect(
      runUsage(run, [{ ...group, _count: { _all: 2, billingUnits: 1 }, _sum: { billingUnits: 2 } }])
        ?.actual,
    ).toBeNull();
    expect(runUsage(run, [])?.actual).toBeNull();
  });
  it("retains the launch estimate before checks exist or after a target is skipped", () => {
    expect(
      runUsage(
        {
          ...run,
          selectionSpec: { providerId: "serpapi", estimatedOperations: 6 },
          startedTargets: 0,
        },
        [],
      ),
    ).toEqual({ actual: 0, estimated: 6, unit: "operations" });
  });
  it("does not let an early-stopped actual mutate the persisted launch estimate", () => {
    expect(
      runUsage(
        {
          ...run,
          selectionSpec: { estimatedOperations: 4, providerId: "serpapi" },
        },
        [{ ...group, _count: { _all: 2, billingUnits: 2 }, _sum: { billingUnits: 3 } }],
      ),
    ).toEqual({ actual: 3, estimated: 4, unit: "operations" });
  });
  it("does not infer native units for a monetary provider or mix fallback units", () => {
    expect(runUsage({ ...run, selectionSpec: { providerId: "dataforseo" } }, [])).toBeNull();
    expect(
      runUsage(run, [{ ...group, provider: "dataforseo", _count: { _all: 2, billingUnits: 2 } }])
        ?.actual,
    ).toBeNull();
  });
  it("projects confirmed ledger units over partial fallback aggregates", () => {
    expect(
      runUsage(run, [{ ...group, _count: { _all: 2, billingUnits: 1 } }], confirmedLedger),
    ).toEqual({ actual: 2, estimated: 4, unit: "operations" });
  });
  it("keeps an unconfirmed ledger unknown instead of resuming the stored fallback", () => {
    const unconfirmed: RunLedgerActual = {
      costCents: null,
      receiptCount: 2,
      unitProvider: "serpapi",
      unconfirmedCount: 1,
      units: null,
    };
    expect(
      runUsage(
        run,
        [{ ...group, _count: { _all: 2, billingUnits: 2 }, _sum: { billingUnits: 3 } }],
        unconfirmed,
      )?.actual,
    ).toBeNull();
  });
  it("treats a recorded receipt without a quantity as unmeasured native usage", () => {
    const unmeasured: RunLedgerActual = {
      costCents: 0.5,
      receiptCount: 1,
      unitProvider: "serpapi",
      unconfirmedCount: 0,
      units: null,
    };
    expect(
      runUsage(
        run,
        [{ ...group, _count: { _all: 2, billingUnits: 2 }, _sum: { billingUnits: 3 } }],
        unmeasured,
      )?.actual,
    ).toBeNull();
  });
  it("falls back to measured check aggregates while the ledger has no receipts", () => {
    const legacy: RunLedgerActual = {
      costCents: 0,
      receiptCount: 0,
      unitProvider: "serpapi",
      unconfirmedCount: 0,
      units: 0,
    };
    expect(
      runUsage(
        run,
        [{ ...group, _count: { _all: 2, billingUnits: 2 }, _sum: { billingUnits: 3 } }],
        legacy,
      ),
    ).toEqual({ actual: 3, estimated: 4, unit: "operations" });
  });
});
