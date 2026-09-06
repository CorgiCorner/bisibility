import { Prisma } from "@/lib/generated/prisma/client";
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
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const input = {
  projectId: "prj_1",
  property: "sc-domain:example.com",
  source: "gsc",
} as const;

const workflowId = "search-insights-backfill:prj_1:abcdef0123456789";
const insideCooldown = dateFromFrozenNow({ milliseconds: 1 - BACKFILL_RESTART_COOLDOWN_MS });
const pastCooldown = dateFromFrozenNow({ milliseconds: -1 - BACKFILL_RESTART_COOLDOWN_MS });

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "imp_1",
    pausedReason: null,
    projectId: "prj_1",
    state: "running",
    updatedAt: dateFromFrozenNow({ minutes: -1 }),
    workflowId,
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    clientVersion: "7.9.1",
    code: "P2002",
  });
}

function queuedWrite(property = input.property, source: "ga4" | "gsc" = input.source) {
  return {
    data: {
      pauseStartedAt: null,
      pausedById: null,
      pausedReason: null,
      state: "queued",
      workflowId: null,
    },
    where: {
      OR: [{ pausedReason: null }, { pausedReason: { not: "user" } }],
      projectId: "prj_1",
      property,
      source,
    },
  };
}

describe("ensureSearchInsightsImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow());
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
  });

  it("creates a queued row without opening an engine connection", async () => {
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
    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it("normalizes the property before creating the worker intent", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_1" });

    await ensureSearchInsightsImport({ ...input, property: "SC-DOMAIN:Example.com/" });

    expect(mocks.prisma.searchAnalyticsImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ property: "sc-domain:example.com", state: "queued" }),
    });
  });

  it("normalizes GA4 ids while leaving search type to the column default", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockResolvedValue({ id: "imp_2" });

    await ensureSearchInsightsImport({ ...input, property: "properties/123456789", source: "ga4" });

    const data = mocks.prisma.searchAnalyticsImport.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ property: "123456789", source: "ga4", state: "queued" });
    expect(data).not.toHaveProperty("searchType");
  });

  it("returns exists without overwriting a live import", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.prisma.searchAnalyticsImport.update).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["a running import", { state: "running" }],
    ["a quota pause", { pausedReason: "rate_limited", state: "paused" }],
    ["lost authorization", { pausedReason: "needs_reauth", state: "paused" }],
  ])("leaves %s alone inside the restart cooldown", async (_label, row) => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow(row));

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["a failed import", { pausedReason: null, state: "failed" }],
    ["an error pause", { pausedReason: "error", state: "paused" }],
    ["a dead execution", { state: "running" }],
  ])("requeues %s after the restart cooldown", async (_label, row) => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ ...row, updatedAt: pastCooldown }),
    );

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(queuedWrite());
  });

  it("does not requeue a stopped import before the restart cooldown expires", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: null, state: "failed", updatedAt: insideCooldown }),
    );

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it("requeues immediately after the workflow id is released", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: "error", state: "paused", workflowId: null }),
    );

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(queuedWrite());
  });

  it("extends a completed import and leaves it queued for the reconciler", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-01-06T00:00:00.000Z"),
        daysDone: 182,
        daysTotal: 182,
        earliestTargetDate: new Date("2026-01-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "completed",
      }),
    );
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      searchSyncImportMonths: 16,
      searchSyncPace: "normal",
    });

    await expect(ensureSearchInsightsImport(input, { rearm: true })).resolves.toEqual({
      status: "queued",
    });

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ state: "queued", workflowId: null }),
      where: {
        id: "imp_1",
        pausedReason: null,
        state: "completed",
        workflowId,
      },
    });
  });

  it("leaves a completed import alone when its retained window is unchanged", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
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

    expect(mocks.prisma.searchAnalyticsImport.update).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it("requeues by key when the existing row cannot be read", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "exists" });

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(queuedWrite());
    consoleError.mockRestore();
  });

  it("reports unavailable only when the database intent write fails", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(ensureSearchInsightsImport(input)).resolves.toEqual({ status: "unavailable" });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
describe("queueSearchInsightsImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
  });

  it("rearms a recovered connection as queued without bypassing a user pause", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(uniqueViolation());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: "needs_reauth", state: "paused" }),
    );

    await queueSearchInsightsImport(input);

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(queuedWrite());
  });

  it("never fails the property selection it runs behind", async () => {
    mocks.prisma.searchAnalyticsImport.create.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(queueSearchInsightsImport(input)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
