import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    searchAnalyticsImport: { findUnique: vi.fn(), updateMany: vi.fn() },
    searchInsightsPropertyRegistry: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./user-pause", () => ({
  USER_PAUSE_REASON: "user",
  userPauseGuard: (id: string) => ({
    OR: [{ pausedReason: null }, { pausedReason: { not: "user" } }],
    id,
  }),
}));

import { replanActiveGscBackfill } from "./backfill-plan";

const projectId = "project_1";
const property = "sc-domain:example.com";

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    cursorDate: new Date("2026-06-01T00:00:00.000Z"),
    daysDone: 36,
    daysTotal: 92,
    earliestTargetDate: new Date("2026-04-07T00:00:00.000Z"),
    firstDataDate: new Date("2025-03-07T00:00:00.000Z"),
    id: "imp_1",
    newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
    pausedReason: null,
    projectId,
    state: "running",
    workflowId: "workflow_1",
    ...overrides,
  };
}

describe("replanActiveGscBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.searchInsightsPropertyRegistry.findFirst.mockResolvedValue({
      propertyKey: property,
    });
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow());
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
  });

  it("extends an open import without moving its cursor or imported days", async () => {
    await expect(
      replanActiveGscBackfill({ projectId, retentionMonths: 16 }, mocks.prisma as never),
    ).resolves.toBe(true);

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: {
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        plannedRetentionMonths: 16,
      },
      where: {
        OR: [{ pausedReason: null }, { pausedReason: { not: "user" } }],
        id: "imp_1",
        project: {
          searchInsightsPropertyRegistry: {
            some: { propertyKey: property, status: "active" },
          },
        },
        state: { not: "completed" },
      },
    });
  });

  it("shortens an open import and completes it once its cursor is past the new floor", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-03-01T00:00:00.000Z"),
        daysDone: 150,
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
      }),
    );

    await expect(
      replanActiveGscBackfill({ projectId, retentionMonths: 3 }, mocks.prisma as never),
    ).resolves.toBe(true);

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: {
        daysDone: 92,
        daysTotal: 92,
        earliestTargetDate: new Date("2026-04-07T00:00:00.000Z"),
        plannedRetentionMonths: 3,
        state: "completed",
        workflowId: null,
      },
      where: expect.any(Object),
    });
  });

  it("leaves a user-paused import untouched", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ pausedReason: "user", state: "paused" }),
    );

    await expect(
      replanActiveGscBackfill({ projectId, retentionMonths: 16 }, mocks.prisma as never),
    ).resolves.toBe(false);

    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });

  it("waits for an in-flight batch before reading the row to re-plan", async () => {
    let releaseLock: () => void = () => undefined;
    mocks.prisma.$queryRaw.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseLock = resolve;
        }),
    );
    const replan = replanActiveGscBackfill(
      { projectId, retentionMonths: 3 },
      mocks.prisma as never,
    );

    await vi.waitFor(() => expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce());
    expect(mocks.prisma.searchAnalyticsImport.findUnique).not.toHaveBeenCalled();
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(
      importRow({ state: "completed" }),
    );
    releaseLock();

    await expect(replan).resolves.toBe(false);
    expect(mocks.prisma.searchAnalyticsImport.updateMany).not.toHaveBeenCalled();
  });
});
