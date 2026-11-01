import { beforeEach, describe, expect, it } from "vitest";
import { item, mocks, run, runIds, setupRankRunQueryMocks } from "./rank-check-runs.test-fixture";

const { getRankCheckRun, listRankCheckRunItems, listRankCheckRuns } = await import(
  "./rank-check-runs"
);

describe("rank-check run queries", () => {
  beforeEach(setupRankRunQueryMocks);

  it("returns the persisted result depth and fractional cost within the requested project", async () => {
    mocks.runFindFirst.mockResolvedValue({ id: "run_1" });
    const projection = { result: "partial", returnedDepth: 20 };
    mocks.evidence.mockResolvedValueOnce(new Map([["check_1", projection]]));
    mocks.itemFindMany.mockResolvedValue([
      {
        ...item("item_1", new Date()),
        status: "completed",
        rankCheck: {
          costCents: { toString: () => "0.4000" },
          errorCode: null,
          id: "rc_stored",
          position: null,
          observationRun: { completeness: "unknown" },
          provider: "dataforseo",
          publicId: "check_1",
          rankingUrl: null,
          requestedDepth: 20,
        },
      },
    ]);
    const page = await listRankCheckRunItems(
      "project_1",
      runIds[0] as string,
      new URL("https://example.com/items"),
    );
    expect(page.data[0]?.rankCheck).toMatchObject({
      costCents: null,
      observationCompleteness: "unknown",
      evidenceProjection: projection,
      requestedDepth: 20,
      position: null,
    });
    expect(mocks.runFindFirst).toHaveBeenCalledWith({
      select: { id: true, projectId: true, publicId: true, selectionSpec: true, status: true },
      where: { projectId: "project_1", publicId: runIds[0], deletedAt: null },
    });
    expect(mocks.itemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankCheck: {
            select: {
              deferredReason: true,
              errorCode: true,
              id: true,
              observationRun: { select: { completeness: true } },
              position: true,
              provider: true,
              publicId: true,
              rankingUrl: true,
              requestedDepth: true,
            },
          },
        }),
        where: { runId: "run_1" },
      }),
    );
    expect(mocks.itemFindMany.mock.calls[0]?.[0]).not.toHaveProperty("select.actualCostCents");
  });

  it("keeps stored target fields when the ledger has no receipts for the run", async () => {
    mocks.runFindFirst.mockResolvedValue({ id: "run_1" });
    mocks.itemFindMany.mockResolvedValue([
      {
        ...item("item_1", new Date()),
        status: "completed",
        actualCostCents: 4,
        rankCheck: {
          billingUnits: 5,
          costCents: { toString: () => "9.0000" },
          errorCode: null,
          id: "rc_stored",
          position: 1,
          provider: "serpapi",
          publicId: "check_1",
          rankingUrl: null,
          requestedDepth: 20,
        },
      },
    ]);

    const page = await listRankCheckRunItems(
      "project_1",
      runIds[0] as string,
      new URL("https://example.com/items"),
    );

    expect(page.data[0]).toMatchObject({ actualCostCents: null });
    expect(page.data[0]?.rankCheck).toMatchObject({ billingUnits: null });
  });

  it("projects per-target ledger actuals onto target cost and units, one receipt set per target", async () => {
    mocks.runFindFirst.mockResolvedValue({ id: "run_1" });
    const check = (id: string, billingUnits: number | null) => ({
      billingUnits,
      costCents: null,
      errorCode: null,
      id,
      position: null,
      provider: "serpapi",
      publicId: `check_${id}`,
      rankingUrl: null,
      requestedDepth: 20,
    });
    mocks.itemFindMany.mockResolvedValue([
      {
        ...item("item_1", new Date("2026-09-02T10:00:00.000Z")),
        status: "completed",
        actualCostCents: 4,
        rankCheck: check("rc_ledger", null),
      },
      {
        ...item("item_2", new Date("2026-09-02T11:00:00.000Z")),
        status: "failed",
        actualCostCents: null,
        rankCheck: check("rc_unconfirmed", 5),
      },
    ]);
    mocks.ledgerRaw.mockResolvedValue([
      {
        scopeId: "rc_ledger",
        receiptCount: 2,
        unitProvider: "serpapi",
        unconfirmedCount: 0,
        unmeasuredCount: 0,
        recordedCostCents: 0.925,
        recordedUnits: 3,
      },
      {
        scopeId: "rc_unconfirmed",
        receiptCount: 1,
        unitProvider: "serpapi",
        unconfirmedCount: 1,
        unmeasuredCount: 0,
        recordedCostCents: 0.5,
        recordedUnits: 1,
      },
    ]);

    const page = await listRankCheckRunItems(
      "project_1",
      runIds[0] as string,
      new URL("https://example.com/items"),
    );

    expect(page.data[0]).toMatchObject({ actualCostCents: 0.925 });
    expect(page.data[0]?.rankCheck).toMatchObject({ billingUnits: 3, costCents: 0.925 });
    expect(page.data[1]).toMatchObject({ actualCostCents: null });
    expect(page.data[1]?.rankCheck).toMatchObject({ billingUnits: null, costCents: null });
    expect(mocks.ledgerRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.arrayContaining(["project_1", "run_1"]),
      }),
    );
  });

  it("derives run cost and native actual from the ledger in list and detail", async () => {
    const row = {
      ...run(runIds[0] as string, new Date("2026-09-02T12:00:00.000Z")),
      _count: { items: 2 },
      selectionSpec: { providerId: "serpapi" },
      targetCount: 2,
    };
    mocks.raw.mockResolvedValue([{ publicId: row.publicId }]);
    mocks.runFindMany.mockResolvedValue([row]);
    mocks.runFindFirst.mockResolvedValue(row);
    mocks.ledgerRaw.mockResolvedValue([
      {
        scopeId: row.id,
        receiptCount: 2,
        unitProvider: "serpapi",
        unconfirmedCount: 0,
        unmeasuredCount: 0,
        recordedCostCents: 0.925,
        recordedUnits: 2,
      },
    ]);

    const detail = await getRankCheckRun("project_1", row.publicId);
    const list = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=history"),
    );

    expect(detail.costCents).toBe(0.925);
    expect(detail.usage).toMatchObject({ actual: 2, unit: "operations" });
    expect(list.data[0]).toMatchObject({ costCents: 0.925, usage: { actual: 2 } });
    expect(mocks.ledgerRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.arrayContaining(["project_1", expect.arrayContaining([row.id])]),
      }),
    );
  });

  it("keeps an unconfirmed ledger explicit instead of resuming stored cost or units", async () => {
    const row = {
      ...run(runIds[0] as string, new Date("2026-09-02T12:00:00.000Z")),
      _count: { items: 2 },
      selectionSpec: { providerId: "serpapi" },
      targetCount: 2,
    };
    mocks.runFindFirst.mockResolvedValue(row);
    mocks.usageGroups.mockResolvedValue([
      {
        runId: row.id,
        provider: "serpapi",
        requestedDepth: 20,
        _count: { _all: 2, billingUnits: 2 },
        _sum: { billingUnits: 3 },
      },
    ]);
    mocks.ledgerRaw.mockResolvedValue([
      {
        scopeId: row.id,
        receiptCount: 2,
        unitProvider: "serpapi",
        unconfirmedCount: 1,
        unmeasuredCount: 0,
        recordedCostCents: 1,
        recordedUnits: 2,
      },
    ]);

    const detail = await getRankCheckRun("project_1", row.publicId);

    expect(detail.costCents).toBeNull();
    expect(detail.usage?.actual).toBeNull();
  });
});
