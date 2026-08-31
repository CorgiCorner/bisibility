import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileQueuedSearchInsightsImports } from "./queued-import-reconciler";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  resolveGa4: vi.fn(),
  resolveGsc: vi.fn(),
  start: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { searchAnalyticsImport: { findMany: mocks.findMany, updateMany: mocks.updateMany } },
}));
vi.mock("@/lib/temporal/search-insights-client", () => ({
  startSearchInsightsBackfillWorkflow: mocks.start,
}));
vi.mock("./credentials", () => ({ resolveSearchInsightsConnection: mocks.resolveGsc }));
vi.mock("./sessions-credentials", () => ({ resolveOrganicSessionsConnection: mocks.resolveGa4 }));

const queued = (overrides = {}) => ({
  cursorDate: new Date("2026-07-01"),
  earliestTargetDate: new Date("2025-03-01"),
  id: "import_1",
  pausedReason: null,
  projectId: "project_1",
  property: "sc-domain:example.com",
  source: "gsc",
  state: "queued",
  workflowId: null,
  ...overrides,
});

describe("reconcileQueuedSearchInsightsImports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.resolveGsc.mockResolvedValue({ property: "sc-domain:example.com" });
    mocks.resolveGa4.mockResolvedValue({ property: "123456789" });
    mocks.start.mockResolvedValue({ workflowId: "workflow_1" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("starts an eligible frozen queued import and stamps its workflow id", async () => {
    mocks.findMany.mockResolvedValue([queued({ workflowId: "stale_or_null" })]);

    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 1,
      failed: 0,
      scanned: 1,
      skipped: 0,
      stamped: 1,
    });
    expect(mocks.start).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { workflowId: "workflow_1" },
      where: {
        id: "import_1",
        pausedReason: null,
        project: {
          searchInsightsPropertyRegistry: {
            some: { propertyKey: "sc-domain:example.com", status: "active" },
          },
        },
        state: "queued",
      },
    });
  });

  it("uses a bounded deterministic query and excludes paused rows", async () => {
    await reconcileQueuedSearchInsightsImports({ batchSize: 7 });
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: expect.any(Object),
      take: 7,
      where: { pausedReason: null, source: { in: ["gsc", "ga4"] }, state: "queued" },
    });
  });

  it("starts an eligible row after a full batch of stale rows", async () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, index) =>
        queued({ id: `stale_${index}`, property: `sc-domain:stale-${index}.example.com` }),
      ),
      queued({ id: "eligible" }),
    ];
    mocks.findMany.mockResolvedValueOnce(rows.slice(0, 25)).mockResolvedValueOnce(rows.slice(25));

    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 1,
      failed: 0,
      scanned: 26,
      skipped: 25,
      stamped: 1,
    });
    expect(mocks.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: { id: "stale_24" }, skip: 1, take: 25 }),
    );
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
  });

  it("bounds a sweep when every scanned row is stale", async () => {
    mocks.findMany.mockImplementation(({ cursor }) => {
      const page = Number(cursor?.id.split("_").at(-1) ?? -1) + 1;
      return Promise.resolve(
        Array.from({ length: 25 }, (_, index) => {
          const rowNumber = page * 25 + index;
          return queued({
            id: `stale_${rowNumber}`,
            property: `sc-domain:stale-${rowNumber}.example.com`,
          });
        }),
      );
    });

    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 0,
      failed: 0,
      scanned: 100,
      skipped: 100,
      stamped: 0,
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(4);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("skips completed cursors and stale properties", async () => {
    mocks.findMany.mockResolvedValue([
      queued({ id: "done", cursorDate: new Date("2025-02-28") }),
      queued({ id: "stale", property: "sc-domain:old.example.com" }),
    ]);
    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 0,
      failed: 0,
      scanned: 2,
      skipped: 2,
      stamped: 0,
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("supports GA4 through its matching active connection", async () => {
    mocks.findMany.mockResolvedValue([queued({ property: "123456789", source: "ga4" })]);
    await reconcileQueuedSearchInsightsImports();
    expect(mocks.start).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
  });

  it("uses the active registry GA4 mapping in the guarded stamp", async () => {
    mocks.findMany.mockResolvedValue([queued({ property: "123456789", source: "ga4" })]);
    await reconcileQueuedSearchInsightsImports();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: {
            searchInsightsPropertyRegistry: {
              some: { ga4PropertyId: "123456789", status: "active" },
            },
          },
        }),
      }),
    );
  });

  it("isolates starter failures and leaves failed rows eligible", async () => {
    mocks.findMany.mockResolvedValue([queued(), queued({ id: "import_2" })]);
    mocks.start
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ workflowId: "workflow_2" });
    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 2,
      failed: 1,
      scanned: 2,
      skipped: 0,
      stamped: 1,
    });
    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "import_2" }) }),
    );
  });

  it("does not stamp when the active property changes after the start", async () => {
    mocks.findMany.mockResolvedValue([queued()]);
    mocks.resolveGsc
      .mockResolvedValueOnce({ property: "sc-domain:example.com" })
      .mockResolvedValueOnce({ property: "sc-domain:new.example.com" });
    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 1,
      failed: 0,
      scanned: 1,
      skipped: 1,
      stamped: 0,
    });
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("isolates a connection guard failure from the next row", async () => {
    mocks.findMany.mockResolvedValue([queued(), queued({ id: "import_2" })]);
    mocks.resolveGsc
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue({ property: "sc-domain:example.com" });
    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 1,
      failed: 1,
      scanned: 2,
      skipped: 0,
      stamped: 1,
    });
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it("does not count a guarded stamp rejected by a concurrent pause", async () => {
    mocks.findMany.mockResolvedValue([queued()]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(reconcileQueuedSearchInsightsImports()).resolves.toEqual({
      attempted: 1,
      failed: 0,
      scanned: 1,
      skipped: 1,
      stamped: 0,
    });
  });
});
