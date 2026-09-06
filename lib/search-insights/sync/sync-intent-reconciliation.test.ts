import { Prisma } from "@/lib/generated/prisma/client";
import { reconcileQueuedSearchInsightsImportsActivity } from "@/lib/temporal/search-insights-reconciliation-activity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSearchInsightsImport } from "./ensure-import";
import { reconcileRequestedSearchInsightsSyncs } from "./requested-sync-reconciler";
import { requestSearchInsightsSync } from "./sync-now";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  findMany: vi.fn(),
  loadImportRow: vi.fn(),
  project: vi.fn(),
  projectDefaults: vi.fn(),
  resolveGa4: vi.fn(),
  resolveGsc: vi.fn(),
  startBackfill: vi.fn(),
  startSync: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.project },
    projectDefaults: { findUnique: mocks.projectDefaults },
    searchAnalyticsImport: {
      create: mocks.create,
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      upsert: mocks.upsert,
    },
  },
}));
vi.mock("@/lib/temporal/search-insights-client", () => ({
  startSearchInsightsBackfillWorkflow: mocks.startBackfill,
  startSearchInsightsSyncWorkflow: mocks.startSync,
}));
vi.mock("./credentials", () => ({
  resolveSearchInsightsConnection: mocks.resolveGsc,
  SEARCH_INSIGHTS_SOURCE: "gsc",
}));
vi.mock("./import-state", () => ({ loadImportRow: mocks.loadImportRow }));
vi.mock("./sessions-credentials", () => ({ resolveOrganicSessionsConnection: mocks.resolveGa4 }));

const input = { actorId: "usr_1", projectId: "project_1" };
const property = "sc-domain:example.com";

type ImportRow = {
  cursorDate: Date | null;
  daysTotal: number;
  firstDataDate: Date | null;
  earliestTargetDate: Date | null;
  id: string;
  lastSyncStartedAt: Date | null;
  newestFinalizedDate: Date | null;
  pausedReason: string | null;
  projectId: string;
  property: string;
  source: "gsc";
  state: "completed" | "queued" | "waiting_for_first_data";
  syncRequestedAt?: Date | null;
  syncStartedAt?: Date | null;
  workflowId: string | null;
};

function importRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    cursorDate: new Date("2026-07-01T00:00:00.000Z"),
    daysTotal: 182,
    firstDataDate: null,
    earliestTargetDate: new Date("2025-03-01T00:00:00.000Z"),
    id: "import_1",
    lastSyncStartedAt: null,
    newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
    pausedReason: null,
    projectId: "project_1",
    property,
    source: "gsc",
    state: "queued",
    workflowId: null,
    ...overrides,
  };
}

describe("search insights sync intent reconciliation", () => {
  let row: ImportRow | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T14:00:00.000Z"));
    vi.stubEnv("SCHEDULER_DRIVER", "worker");
    row = null;
    mocks.project.mockResolvedValue({ id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" });
    mocks.projectDefaults.mockResolvedValue({
      searchSyncImportMonths: 16,
      searchSyncPace: "normal",
    });
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        clientVersion: "7.9.1",
        code: "P2002",
      }),
    );
    mocks.resolveGsc.mockResolvedValue({ property });
    mocks.resolveGa4.mockResolvedValue({ property: "123456789" });
    mocks.loadImportRow.mockImplementation(async () => row);
    mocks.startBackfill.mockResolvedValue({ workflowId: "search-insights-backfill:project_1" });
    mocks.startSync.mockResolvedValue({ workflowId: "search-insights-sync:project_1" });
    mocks.upsert.mockImplementation(async ({ create, update }) => {
      row = row ? { ...row, ...update } : importRow(create);
      return row;
    });
    mocks.findMany.mockImplementation(async ({ where }) => {
      if (!row || row.pausedReason !== null) return [];
      if (where.state === "queued") return row.state === "queued" ? [row] : [];
      if (where.syncRequestedAt?.not !== null || !row.syncRequestedAt || row.syncStartedAt)
        return [];
      if (where.state?.notIn?.includes(row.state)) return [];
      return [row];
    });
    mocks.updateMany.mockImplementation(async ({ data, where }) => {
      if (!row) return { count: 0 };
      if (data.state === "queued" && where.state === "completed") {
        const eligible =
          row.id === where.id &&
          row.pausedReason === where.pausedReason &&
          row.state === where.state &&
          row.workflowId === where.workflowId;
        if (!eligible) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      }
      if (data.workflowId) {
        row = { ...row, workflowId: data.workflowId };
        return { count: 1 };
      }
      if (data.syncStartedAt) {
        const eligible =
          row.id === where.id &&
          row.syncRequestedAt === where.syncRequestedAt &&
          row.syncStartedAt === null &&
          !where.state?.notIn?.includes(row.state);
        if (!eligible) return { count: 0 };
        row = { ...row, syncStartedAt: data.syncStartedAt };
        return { count: 1 };
      }
      if (data.syncRequestedAt === null && row.syncStartedAt === where.syncStartedAt) {
        row = { ...row, syncRequestedAt: null };
        return { count: 1 };
      }
      return { count: 0 };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("routes a fresh Sync now request to one backfill start across a full sweep", async () => {
    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
    await reconcileQueuedSearchInsightsImportsActivity();

    expect(row).toMatchObject({ state: "queued" });
    expect(row?.syncRequestedAt).toBeUndefined();
    expect(mocks.startBackfill).toHaveBeenCalledOnce();
    expect(mocks.startSync).not.toHaveBeenCalled();
  });

  it("keeps a queued backfill request as a single backfill start", async () => {
    row = importRow({
      syncRequestedAt: new Date("2026-09-03T13:30:00.000Z"),
      workflowId: null,
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
    expect(row.syncRequestedAt).toBeNull();
    await reconcileQueuedSearchInsightsImportsActivity();

    expect(mocks.startBackfill).toHaveBeenCalledOnce();
    expect(mocks.startSync).not.toHaveBeenCalled();
  });

  it("routes a completed Sync now request to one incremental sync start from the intent sweep", async () => {
    row = importRow({ state: "completed" });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
    expect(row.syncRequestedAt).toEqual(new Date("2026-09-03T14:00:00.000Z"));
    await reconcileRequestedSearchInsightsSyncs();

    expect(mocks.startBackfill).not.toHaveBeenCalled();
    expect(mocks.startSync).toHaveBeenCalledOnce();
  });

  it("requeues a completed extension once for the worker-side backfill reconciler", async () => {
    row = importRow({
      cursorDate: new Date("2026-01-06T00:00:00.000Z"),
      earliestTargetDate: new Date("2026-01-07T00:00:00.000Z"),
      state: "completed",
      workflowId: "finished_workflow",
    });

    await expect(
      ensureSearchInsightsImport({ projectId: "project_1", property, source: "gsc" }),
    ).resolves.toEqual({ status: "queued" });

    expect(row).toMatchObject({ state: "queued", workflowId: null });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ state: "queued", workflowId: null }),
      where: {
        id: "import_1",
        pausedReason: null,
        state: "completed",
        workflowId: "finished_workflow",
      },
    });
    await reconcileQueuedSearchInsightsImportsActivity();

    expect(mocks.startBackfill).toHaveBeenCalledOnce();
    expect(mocks.startSync).not.toHaveBeenCalled();
  });

  it("leaves a completed import unchanged when its retained window is current", async () => {
    row = importRow({
      cursorDate: new Date("2025-03-06T00:00:00.000Z"),
      earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
      state: "completed",
      workflowId: "finished_workflow",
    });

    await expect(
      ensureSearchInsightsImport({ projectId: "project_1", property, source: "gsc" }),
    ).resolves.toEqual({ status: "exists" });
    await reconcileQueuedSearchInsightsImportsActivity();

    expect(row).toMatchObject({ state: "completed", workflowId: "finished_workflow" });
    expect(mocks.startBackfill).not.toHaveBeenCalled();
  });
});
