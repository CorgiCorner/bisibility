import { Prisma } from "@/lib/generated/prisma/client";
import { SchedulerDisabledError } from "@/lib/scheduler/driver";
import {
  BACKFILL_RESTART_COOLDOWN_MS,
  ensureSearchInsightsImport,
  queueSearchInsightsImport,
} from "@/lib/search-insights/sync/ensure-import";
import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    projectDefaults: { findUnique: vi.fn() },
    searchAnalyticsImport: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
  startBackfill: vi.fn(),
  startSync: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/temporal/search-insights-client", () => ({
  startSearchInsightsBackfillWorkflow: mocks.startBackfill,
  startSearchInsightsSyncWorkflow: mocks.startSync,
}));

const input = {
  projectId: "prj_1",
  property: "sc-domain:example.com",
  source: "gsc",
} as const;

const workflowId = "search-insights-backfill:prj_1:abcdef0123456789";

const insideCooldown = dateFromFrozenNow({ milliseconds: 1 - BACKFILL_RESTART_COOLDOWN_MS });
const pastCooldown = dateFromFrozenNow({ milliseconds: -1 - BACKFILL_RESTART_COOLDOWN_MS });

// A progressing backfill stamps the row on every stored day, so "a minute ago" is what a
// live execution looks like to the render path.
function importRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "imp_1",
    pausedReason: null,
    state: "running",
    updatedAt: dateFromFrozenNow({ minutes: -1 }),
    workflowId,
    ...overrides,
  };
}

function startedWorkflowWrite() {
  return {
    data: { workflowId },
    where: {
      projectId: "prj_1",
      property: "sc-domain:example.com",
      source: "gsc",
    },
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    clientVersion: "7.8.0",
    code: "P2002",
  });
}

describe("ensureSearchInsightsImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow());
    mocks.startBackfill.mockResolvedValue({ workflowId });
  });

  it("queues a new import row for a property that has none", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_1" });

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "queued" });

    expect(mocks.prisma.searchAnalyticsImport.create).toHaveBeenCalledWith({
      data: {
        projectId: "prj_1",
        property: "sc-domain:example.com",
        source: "gsc",
        state: "queued",
      },
    });
  });

  it("starts one backfill per property and records the execution on the row", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_1" });

    await ensureSearchInsightsImport(input);

    expect(mocks.startBackfill).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(
      startedWorkflowWrite(),
    );
  });

  it("stamps the row on every start so the restart cooldown has something to measure", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: null, state: "failed", updatedAt: pastCooldown }),
    );

    await ensureSearchInsightsImport(input);

    // The workflow id is deterministic, so this start writes the value the row already holds.
    // Guarding the write on a changed id would freeze updatedAt and every later render would
    // pass the cooldown and start again.
    const write = mocks.prisma.searchAnalyticsImport.updateMany.mock.calls[0]?.[0];
    expect(write.where).not.toHaveProperty("OR");
    expect(write.where).toEqual({
      projectId: "prj_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
  });

  it("keys a render-path row to the same normalized property the selection path uses", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_1" });

    await ensureSearchInsightsImport({ ...input, property: "SC-DOMAIN:Example.com/" });

    expect(mocks.prisma.searchAnalyticsImport.create).toHaveBeenCalledWith({
      data: {
        projectId: "prj_1",
        property: "sc-domain:example.com",
        source: "gsc",
        state: "queued",
      },
    });
    expect(mocks.startBackfill).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
  });

  it("starts a sessions backfill while leaving search type to the column default", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_2" });
    mocks.startBackfill.mockResolvedValue({ workflowId });

    await ensureSearchInsightsImport({ ...input, property: "123456789", source: "ga4" });

    const data = mocks.prisma.searchAnalyticsImport.create.mock.calls[0]?.[0].data;
    expect(data.source).toBe("ga4");
    expect(data).not.toHaveProperty("searchType");
    expect(mocks.startBackfill).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "123456789",
      source: "ga4",
    });
  });

  it("never overwrites an existing row when the unique key rejects the create", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.prisma.searchAnalyticsImport.update).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["an execution that is still storing days", { state: "running" }],
    [
      "a quota pause the execution wakes from on its own",
      { pausedReason: "rate_limited", state: "paused" },
    ],
    ["a pause only a reconnect can lift", { pausedReason: "needs_reauth", state: "paused" }],
  ])("starts no execution from a render for %s", async (_label, row) => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow(row));

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    // Every render calls this seam, so a live execution must not cost one workflow start and
    // one row write per page view.
    expect(mocks.startBackfill).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["an import the workflow gave up on", { pausedReason: null, state: "failed" }],
    ["a stalled import", { pausedReason: "error", state: "paused" }],
    ["an execution that died with its worker", { state: "running" }],
  ])("re-arms %s once the row has gone quiet", async (_label, row) => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ ...row, updatedAt: pastCooldown }),
    );

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    // One transient fault must not strand the sixteen-month history until the customer
    // selects the property again; the cooldown caps the retry at one start per window.
    expect(mocks.startBackfill).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
  });

  it("waits out the restart window before re-arming an import that just stopped", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: null, state: "failed", updatedAt: insideCooldown }),
    );

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.startBackfill).not.toHaveBeenCalled();
  });

  it("re-arms a stalled import as soon as its execution has been released", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: "error", state: "paused", workflowId: null }),
    );

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    // Nothing is running behind a released id, so there is no second execution to collide with.
    expect(mocks.startBackfill).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(
      startedWorkflowWrite(),
    );
  });

  it("restarts a completed import when project depth extends beyond its frozen target", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        earliestTargetDate: new Date("2025-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "completed",
      }),
    );
    mocks.prisma.projectDefaults = {
      findUnique: vi
        .fn()
        .mockResolvedValue({ searchSyncImportMonths: 16, searchSyncPace: "normal" }),
    };

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });
    expect(mocks.startBackfill).toHaveBeenCalledTimes(1);
  });

  it("starts no execution for an import that already covers the whole window", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ state: "completed", updatedAt: dateFromFrozenNow({ days: -30 }) }),
    );

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    // Every render of the module calls this seam; a finished import must not cost one
    // execution and one write per view.
    expect(mocks.startBackfill).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it("still starts the backfill when the existing row cannot be read", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.startBackfill).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("reports the import as unavailable on a deployment with no scheduler", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_1" });
    mocks.startBackfill.mockRejectedValue(new SchedulerDisabledError());
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "unavailable" });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reports unavailable and logs when the scheduler is reachable but refuses the start", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_1" });
    mocks.startBackfill.mockRejectedValue(new Error("temporal unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "unavailable" });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reports unavailable instead of throwing at the read path that called it", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "unavailable" });

    expect(mocks.startBackfill).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("queueSearchInsightsImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-arms an import a render is not allowed to restart", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: "needs_reauth", state: "paused" }),
    );
    mocks.startBackfill.mockResolvedValue({ workflowId });

    // Selecting the property is exactly the moment a lost authorization is fixed, so this
    // path is the one that starts the backfill again.
    await queueSearchInsightsImport(input);

    expect(mocks.startBackfill).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
  });

  it("leaves a finished import alone even when the property is selected again", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ state: "completed" }),
    );

    await queueSearchInsightsImport(input);

    expect(mocks.startBackfill).not.toHaveBeenCalled();
  });

  it("keys the row to the property every reader derives from the stored connection", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({});
    mocks.startBackfill.mockResolvedValue({ workflowId });

    // The picker returns the raw value; a case or trailing-slash difference from the stored
    // form would key the import to a property the backfill's connection guard rejects for good.
    await queueSearchInsightsImport({ ...input, property: "SC-DOMAIN:Example.com/" });

    expect(mocks.prisma.searchAnalyticsImport.create).toHaveBeenCalledWith({
      data: {
        projectId: "prj_1",
        property: "sc-domain:example.com",
        source: "gsc",
        state: "queued",
      },
    });
    expect(mocks.startBackfill).toHaveBeenCalledWith({
      projectId: "prj_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
  });

  it("never fails the property selection it runs behind", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(queueSearchInsightsImport(input)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("extends a completed six-month import before reactivation and starts only backfill", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-01-06T00:00:00.000Z"),
        daysDone: 182,
        daysTotal: 182,
        earliestTargetDate: new Date("2026-01-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        projectId: "prj_1",
        state: "completed",
      }),
    );
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      searchSyncImportMonths: 16,
      searchSyncPace: "normal",
    });

    await expect(ensureSearchInsightsImport(input, { rearm: true })).resolves.toEqual({
      status: "exists",
    });

    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith({
      data: {
        cursorDate: new Date("2026-01-06T00:00:00.000Z"),
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        state: "queued",
        workflowId: null,
      },
      where: { id: "imp_1" },
    });
    expect(mocks.startBackfill).toHaveBeenCalledTimes(1);
    expect(mocks.startSync).not.toHaveBeenCalled();
  });

  it("re-activates a completed import at unchanged depth with incremental only", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        projectId: "prj_1",
        state: "completed",
      }),
    );
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      searchSyncImportMonths: 16,
      searchSyncPace: "normal",
    });

    await ensureSearchInsightsImport(input, { rearm: true });

    expect(mocks.prisma.searchAnalyticsImport.update).not.toHaveBeenCalled();
    expect(mocks.startBackfill).not.toHaveBeenCalled();
    expect(mocks.startSync).toHaveBeenCalledWith({ projectId: "prj_1" });
  });

  it("keeps a completed deeper plan when settings become shallower and starts incremental only", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        cursorDate: new Date("2025-03-06T00:00:00.000Z"),
        daysDone: 488,
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        projectId: "prj_1",
        state: "completed",
      }),
    );
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      searchSyncImportMonths: 6,
      searchSyncPace: "normal",
    });

    await ensureSearchInsightsImport(input, { rearm: true });

    expect(mocks.prisma.searchAnalyticsImport.update).not.toHaveBeenCalled();
    expect(mocks.startBackfill).not.toHaveBeenCalled();
    expect(mocks.startSync).toHaveBeenCalledWith({ projectId: "prj_1" });
  });

  it("leaves a failed extension start queued without an obsolete workflow id", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-01-06T00:00:00.000Z"),
        daysDone: 182,
        daysTotal: 182,
        earliestTargetDate: new Date("2026-01-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        projectId: "prj_1",
        state: "completed",
      }),
    );
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      searchSyncImportMonths: 16,
      searchSyncPace: "normal",
    });
    mocks.startBackfill.mockRejectedValue(new Error("temporal unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(ensureSearchInsightsImport(input, { rearm: true })).resolves.toEqual({
      status: "unavailable",
    });

    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "queued", workflowId: null }),
      }),
    );
    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
