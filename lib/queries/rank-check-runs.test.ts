import { beforeEach, describe, expect, it } from "vitest";
import { mocks, run, runIds, setupRankRunQueryMocks } from "./rank-check-runs.test-fixture";

const { getRankCheckRun, listRankCheckRuns } = await import("./rank-check-runs");

describe("rank-check run queries", () => {
  beforeEach(setupRankRunQueryMocks);

  it("returns a schema-valid cancelled detail for legacy completed/cancelled outcome", async () => {
    const row = {
      ...run(runIds[0] as string, new Date("2026-10-21T16:00:00Z")),
      outcome: "cancelled",
      trigger: "scheduled",
      cancelledCount: 1,
      completedCount: 0,
      costCents: 0.125,
    };
    mocks.runFindFirst.mockResolvedValueOnce(row);
    const result = await getRankCheckRun("project_1", row.publicId);
    expect(result).toMatchObject({
      id: row.publicId,
      status: "cancelled",
      outcome: null,
      costCents: null,
      counts: { cancelled: 1, completed: 0 },
    });
    const { rankCheckRunDto } = await import("./rank-check-run-dto");
    expect(rankCheckRunDto(row as never)).toMatchObject({
      costCents: 0.125,
      status: "cancelled",
      outcome: null,
    });
    const { rankCheckOperationSchema } = await import("@/lib/rank-check/runs/contract");
    expect(() => rankCheckOperationSchema.parse(result)).not.toThrow();
  });

  it("returns operation usage from all checks in the scoped run, independently of target pagination", async () => {
    const row = {
      ...run(runIds[0] as string, new Date()),
      _count: { items: 2 },
      targetCount: 2,
      selectionSpec: { providerId: "serpapi" },
    };
    mocks.runFindFirst.mockResolvedValueOnce(row);
    mocks.usageGroups.mockResolvedValueOnce([
      {
        runId: row.id,
        provider: "serpapi",
        requestedDepth: 20,
        _count: { _all: 2, billingUnits: 0 },
        _sum: { billingUnits: null },
      },
    ]);
    const result = await getRankCheckRun("project_1", row.publicId);
    expect(result.usage).toEqual({ actual: null, estimated: 4, unit: "operations" });
    expect(mocks.usageGroups).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runId: { in: [row.id] } } }),
    );
  });

  it("agrees on the launch native estimate between the run list and run detail", async () => {
    const nativeEstimate = {
      providerId: "serpapi",
      quantity: 12,
      unit: "units" as const,
      unknownTargets: 0,
    };
    const row = {
      ...run(runIds[0] as string, new Date("2026-09-02T12:00:00.000Z")),
      selectionSpec: { kind: "all", nativeEstimate, providerAtLaunch: "serpapi", v: 1 },
    };
    mocks.raw.mockResolvedValueOnce([{ publicId: row.publicId }]);
    mocks.runFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    mocks.runFindFirst.mockResolvedValueOnce(row);

    const detail = await getRankCheckRun("project_1", row.publicId);
    const list = await listRankCheckRuns(
      "project_1",
      new URL("http://localhost/api/rank-check-runs?segment=history"),
    );

    expect(detail.nativeEstimate).toEqual(nativeEstimate);
    expect(list.data[0]?.nativeEstimate).toEqual(nativeEstimate);
  });

  it("pages launched and skipped history without duplicates or gaps", async () => {
    const dates = [new Date("2026-09-02T12:00:00.000Z"), new Date("2026-09-02T10:00:00.000Z")];
    const skippedAt = new Date("2026-09-02T11:00:00.000Z");
    const skipped = {
      ...run(runIds[1] as string, null),
      finishedAt: skippedAt,
      plannedFor: new Date("2026-09-02T06:00:00.000Z"),
      status: "cancelled",
    };
    mocks.runFindMany
      .mockResolvedValueOnce([
        run(runIds[0] as string, dates[0] as Date),
        skipped,
        run(runIds[2] as string, dates[1] as Date),
      ])
      .mockResolvedValueOnce([run(runIds[2] as string, dates[1] as Date)]);
    mocks.raw
      .mockResolvedValueOnce(runIds.map((publicId) => ({ publicId })))
      .mockResolvedValueOnce([{ publicId: runIds[2] }]);

    const first = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x&limit=2"),
    );
    const second = await listRankCheckRuns(
      "project_1",
      new URL(
        `https://example.com/api/rank-check-runs?project=prj_x&limit=2&cursor=${first.nextCursor}`,
      ),
    );

    expect([...first.data, ...second.data].map(({ id }) => id)).toEqual(runIds);
    expect(first.data[1]).toMatchObject({
      finishedAt: skippedAt.toISOString(),
      status: "cancelled",
    });
    expect(mocks.raw).toHaveBeenLastCalledWith(
      expect.objectContaining({
        strings: expect.arrayContaining([
          expect.stringContaining('COALESCE("launchedAt", "finishedAt")'),
        ]),
      }),
    );
  });

  it("returns the actor who skipped an occurrence", async () => {
    const skipped = {
      ...run(runIds[0] as string, null),
      finishedAt: new Date("2026-09-02T11:00:00.000Z"),
      status: "cancelled",
    };
    mocks.raw.mockResolvedValue([{ publicId: skipped.publicId }]);
    mocks.runFindMany.mockResolvedValue([skipped]);
    mocks.auditLog.findMany.mockResolvedValue([
      {
        actor: { email: "anna@example.com", image: null, name: "Anna Kowalska" },
        targetId: skipped.publicId,
      },
    ]);

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x"),
    );

    expect(result.data[0]).toMatchObject({
      skippedBy: { initials: "AK", name: "Anna Kowalska" },
    });
  });

  it("orders the planned segment forward by plannedFor", async () => {
    mocks.runFindMany.mockResolvedValue([]);
    await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=planned"),
    );

    expect(mocks.runFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ plannedFor: "asc" }, { publicId: "asc" }],
        where: expect.objectContaining({ status: { in: ["planned", "blocked"] } }),
      }),
    );
  });

  it("pages launched and unlaunched blocked runs in their correct segments", async () => {
    const plannedDates = [
      new Date("2026-09-02T10:00:00.000Z"),
      new Date("2026-09-03T10:00:00.000Z"),
    ];
    const launchedDates = [
      new Date("2026-09-04T10:00:00.000Z"),
      new Date("2026-09-03T10:00:00.000Z"),
    ];
    const blockedPlanned = plannedDates.map((date, index) => ({
      ...run(runIds[index] as string, null, date),
      status: "blocked",
    }));
    const blockedLaunched = launchedDates.map((date, index) => ({
      ...run(runIds[index + 1] as string, date),
      status: "blocked",
    }));
    mocks.runFindMany
      .mockResolvedValueOnce(blockedPlanned)
      .mockResolvedValueOnce([blockedPlanned[1]])
      .mockResolvedValueOnce(blockedLaunched)
      .mockResolvedValueOnce([blockedLaunched[1]]);
    mocks.raw
      .mockResolvedValueOnce(blockedLaunched.map(({ publicId }) => ({ publicId })))
      .mockResolvedValueOnce([{ publicId: blockedLaunched[1]?.publicId }]);

    const plannedFirst = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=planned&limit=1"),
    );
    const plannedSecond = await listRankCheckRuns(
      "project_1",
      new URL(
        `https://example.com/api/rank-check-runs?segment=planned&limit=1&cursor=${plannedFirst.nextCursor}`,
      ),
    );
    const historyFirst = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=history&limit=1"),
    );
    const historySecond = await listRankCheckRuns(
      "project_1",
      new URL(
        `https://example.com/api/rank-check-runs?segment=history&limit=1&cursor=${historyFirst.nextCursor}`,
      ),
    );

    expect([...plannedFirst.data, ...plannedSecond.data].map(({ id }) => id)).toEqual([
      blockedPlanned[0]?.publicId,
      blockedPlanned[1]?.publicId,
    ]);
    expect([...historyFirst.data, ...historySecond.data].map(({ id }) => id)).toEqual([
      blockedLaunched[0]?.publicId,
      blockedLaunched[1]?.publicId,
    ]);
    expect(mocks.runFindMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          launchedAt: null,
          plannedFor: { not: null },
          status: { in: ["planned", "blocked"] },
        }),
      }),
    );
    expect(mocks.raw).toHaveBeenCalledTimes(2);
  });
});
