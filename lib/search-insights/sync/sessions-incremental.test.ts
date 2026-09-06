import { dateOnlyFromFrozenNow, FROZEN_NOW } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countCappedDays: vi.fn(),
  ensureImport: vi.fn(),
  prisma: {
    organicSessionsPageDaily: { groupBy: vi.fn() },
    project: { findMany: vi.fn() },
    searchAnalyticsImport: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
  recordImportFailure: vi.fn(),
  resolveConnection: vi.fn(),
  syncRange: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./ensure-import", () => ({ ensureSearchInsightsImport: mocks.ensureImport }));
vi.mock("./import-state", () => ({ recordImportFailure: mocks.recordImportFailure }));
vi.mock("./partitions", () => ({ countCappedDays: mocks.countCappedDays }));
vi.mock("./sessions-credentials", () => ({
  ORGANIC_SESSIONS_SOURCE: "ga4",
  resolveOrganicSessionsConnection: mocks.resolveConnection,
}));
vi.mock("./sessions-partitions", () => ({
  ORGANIC_SESSIONS_SETTLING_LAG_DAYS: 1,
  syncOrganicSessionsRange: mocks.syncRange,
}));

const {
  rereadOrganicSessionsMetrics,
  runOrganicSessionsIncrementalForAllProjects,
  runOrganicSessionsIncrementalSync,
} = await import("./sessions-incremental");

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    cursorDate: new Date("2025-03-07T00:00:00.000Z"),
    earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
    finalizedThroughDate: new Date("2026-07-06T00:00:00.000Z"),
    id: "imp_1",
    pausedReason: null,
    state: "completed",
    ...overrides,
  };
}

describe("runOrganicSessionsIncrementalSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveConnection.mockResolvedValue({
      connectionId: "conn_1",
      credentials: { apiKey: "refresh_token", login: "123456789" },
      property: "123456789",
    });
    mocks.prisma.searchAnalyticsImport.findFirst.mockResolvedValue(null);
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow());
    mocks.prisma.organicSessionsPageDaily.groupBy.mockResolvedValue([]);
    mocks.syncRange.mockResolvedValue({ capHit: false });
  });

  it("does not sync sessions while the project search import is user-paused", async () => {
    mocks.prisma.searchAnalyticsImport.findFirst.mockResolvedValue({ id: "gsc_import_1" });

    await expect(
      runOrganicSessionsIncrementalSync({ now: FROZEN_NOW, projectId: "project_1" }),
    ).resolves.toEqual({ daysProcessed: 0, projectId: "project_1", status: "not_connected" });

    expect(mocks.prisma.searchAnalyticsImport.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { pausedReason: "user", projectId: "project_1", source: "gsc" },
    });
    expect(mocks.resolveConnection).not.toHaveBeenCalled();
    expect(mocks.syncRange).not.toHaveBeenCalled();
  });

  it("authoritatively refreshes the trailing three Pacific days through yesterday", async () => {
    await expect(
      runOrganicSessionsIncrementalSync({ now: FROZEN_NOW, projectId: "project_1" }),
    ).resolves.toEqual({ daysProcessed: 3, projectId: "project_1", status: "synced" });

    expect(mocks.syncRange).toHaveBeenCalledWith({
      credentials: { apiKey: "refresh_token", login: "123456789" },
      end: "2026-07-09",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });
    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finalizedThroughDate: new Date("2026-07-09T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("walks a stale gap without advancing the marker past the clamped request", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ finalizedThroughDate: new Date("2026-06-01T00:00:00.000Z") }),
    );

    await expect(
      runOrganicSessionsIncrementalSync({ now: FROZEN_NOW, projectId: "project_1" }),
    ).resolves.toEqual({ daysProcessed: 30, projectId: "project_1", status: "synced" });

    expect(mocks.syncRange).toHaveBeenCalledWith(
      expect.objectContaining({ end: "2026-07-01", start: "2026-06-02" }),
    );
    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finalizedThroughDate: new Date("2026-07-01T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("records capped days from the stored GA4 partitions", async () => {
    mocks.syncRange.mockResolvedValue({ capHit: true });
    mocks.countCappedDays.mockResolvedValue(2);

    await runOrganicSessionsIncrementalSync({ now: FROZEN_NOW, projectId: "project_1" });

    expect(mocks.countCappedDays).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ capHitDays: 2 }) }),
    );
  });

  it("leaves coverage unstamped while the backfill has not finalized a date", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ finalizedThroughDate: null }),
    );

    await runOrganicSessionsIncrementalSync({ now: FROZEN_NOW, projectId: "project_1" });

    const data = mocks.prisma.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty("finalizedThroughDate");
  });
});

describe("rereadOrganicSessionsMetrics", () => {
  const rereadInput = {
    credentials: { apiKey: "refresh_token", login: "123456789" },
    end: "2026-07-09",
    projectId: "project_1",
    property: "123456789",
    start: new Date("2026-07-07T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRange.mockResolvedValue({ capHit: false });
  });

  it("selects only stale days and leaves the next pass idle", async () => {
    const pages = [
      { date: new Date("2026-07-07T00:00:00.000Z"), engagedSessions: null },
      { date: new Date("2026-07-08T00:00:00.000Z"), engagedSessions: 4 },
    ];
    mocks.prisma.organicSessionsPageDaily.groupBy.mockImplementation(({ take, where }) =>
      pages
        .filter(
          (page) =>
            page.date >= where.date.gte &&
            page.date <= where.date.lte &&
            page.engagedSessions === where.engagedSessions,
        )
        .slice(0, take)
        .map(({ date }) => ({ date })),
    );
    mocks.syncRange.mockImplementation(async ({ end }) => {
      const page = pages.find((candidate) => candidate.date.toISOString().startsWith(end));
      if (page) page.engagedSessions = 1;
      return { capHit: false };
    });

    await expect(rereadOrganicSessionsMetrics(rereadInput)).resolves.toEqual({
      capHit: false,
      daysProcessed: 1,
    });
    await expect(rereadOrganicSessionsMetrics(rereadInput)).resolves.toEqual({
      capHit: false,
      daysProcessed: 0,
    });

    expect(mocks.syncRange).toHaveBeenCalledTimes(1);
    expect(mocks.syncRange).toHaveBeenCalledWith(
      expect.objectContaining({ end: "2026-07-07", start: "2026-07-07" }),
    );
  });

  it("processes exactly the fixed re-read bound", async () => {
    const staleDays = [-3, -2, -1, 0].map((days) => ({
      date: new Date(`${dateOnlyFromFrozenNow({ days })}T00:00:00.000Z`),
    }));
    mocks.prisma.organicSessionsPageDaily.groupBy.mockImplementation(({ take }) =>
      staleDays.slice(0, take),
    );

    await expect(
      rereadOrganicSessionsMetrics({ ...rereadInput, end: dateOnlyFromFrozenNow() }),
    ).resolves.toEqual({ capHit: false, daysProcessed: 3 });

    expect(mocks.syncRange).toHaveBeenCalledTimes(3);
    expect(mocks.syncRange.mock.calls.map(([input]) => input.start)).toEqual([
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
    ]);
  });
});

describe("runOrganicSessionsIncrementalForAllProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }]);
    mocks.prisma.searchAnalyticsImport.findFirst.mockResolvedValue(null);
    mocks.resolveConnection.mockResolvedValue({
      connectionId: "conn_1",
      credentials: { apiKey: "refresh_token", login: "123456789" },
      property: "123456789",
    });
    mocks.syncRange.mockResolvedValue({ capHit: false });
  });

  it("queues a backfill before writing a trailing range for an existing connection without an import", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(null);

    await runOrganicSessionsIncrementalForAllProjects(FROZEN_NOW);

    expect(mocks.ensureImport).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
    expect(mocks.syncRange).not.toHaveBeenCalled();
  });

  it("requeues the backfill before refreshing a connection that already has history", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow());

    await runOrganicSessionsIncrementalForAllProjects(FROZEN_NOW);

    expect(mocks.ensureImport).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
    expect(mocks.syncRange).toHaveBeenCalledWith(
      expect.objectContaining({ end: "2026-07-09", start: "2026-07-07" }),
    );
  });

  it("retries an existing import whose workflow id is missing", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ workflowId: null }),
    );

    await runOrganicSessionsIncrementalForAllProjects(FROZEN_NOW);

    expect(mocks.ensureImport).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
  });
});
