import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countCappedDays: vi.fn(),
  loadImportRow: vi.fn(),
  prisma: { searchAnalyticsImport: { update: vi.fn() } },
  readConnection: vi.fn(),
  recordImportFailure: vi.fn(),
  syncRange: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./import-state", () => ({
  loadImportRow: mocks.loadImportRow,
  recordImportFailure: mocks.recordImportFailure,
}));
vi.mock("./sessions-credentials", () => ({ readOrganicSessionsConnection: mocks.readConnection }));
vi.mock("./partitions", () => ({ countCappedDays: mocks.countCappedDays }));
vi.mock("./sessions-partitions", () => ({
  ORGANIC_SESSIONS_SETTLING_LAG_DAYS: 1,
  syncOrganicSessionsRange: mocks.syncRange,
}));

const { runOrganicSessionsBackfillBatch } = await import("./sessions-backfill");

describe("runOrganicSessionsBackfillBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadImportRow.mockResolvedValue({
      cursorDate: new Date("2026-07-08T00:00:00.000Z"),
      daysDone: 0,
      daysTotal: 2,
      earliestTargetDate: new Date("2026-07-07T00:00:00.000Z"),
      finalizedThroughDate: null,
      id: "imp_1",
      newestFinalizedDate: new Date("2026-07-08T00:00:00.000Z"),
      projectId: "project_1",
      property: "123456789",
      state: "running",
    });
    mocks.readConnection.mockResolvedValue({
      connection: {
        connectionId: "conn_1",
        credentials: { apiKey: "refresh_token", login: "123456789" },
        property: "123456789",
      },
      problem: null,
    });
    mocks.syncRange.mockResolvedValue({ capHit: false });
  });

  it("walks a thirty-day-capable range newest first and completes once it reaches retention", async () => {
    await expect(
      runOrganicSessionsBackfillBatch({ projectId: "project_1", property: "123456789" }),
    ).resolves.toEqual({ blocked: false, daysProcessed: 2, done: true, nextCursor: null });

    expect(mocks.loadImportRow).toHaveBeenCalledWith("project_1", "123456789", "ga4");
    expect(mocks.syncRange).toHaveBeenCalledWith({
      credentials: { apiKey: "refresh_token", login: "123456789" },
      end: "2026-07-08",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });
    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cursorDate: new Date("2026-07-06T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-08T00:00:00.000Z"),
      }),
      where: { id: "imp_1" },
    });
  });

  it("keeps its cursor when a batch is aborted before the first range", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runOrganicSessionsBackfillBatch(
        { projectId: "project_1", property: "123456789" },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({ blocked: false, daysProcessed: 0, done: false, nextCursor: "2026-07-08" });

    expect(mocks.syncRange).not.toHaveBeenCalled();
  });
});
