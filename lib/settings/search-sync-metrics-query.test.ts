import { loadSearchSyncMetrics } from "@/lib/settings/search-sync-metrics";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    searchAnalyticsImport: { findUnique: mocks.findUnique },
    searchAnalyticsRequestUsage: { count: mocks.count },
  },
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: vi.fn() }));
describe("loadSearchSyncMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      daysDone: 0,
      daysTotal: 488,
      earliestTargetDate: new Date("2025-03-01"),
      lastQuotaPausedAt: null,
    });
    mocks.count.mockResolvedValue(3);
  });
  it("counts the request ledger inside the Pacific quota day", async () => {
    await expect(
      loadSearchSyncMetrics("prj_1", "sc-domain:example.com", new Date("2026-08-28T16:00:00Z")),
    ).resolves.toMatchObject({ requestsToday: 3 });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        attemptedAt: {
          gte: new Date("2026-08-28T07:00:00Z"),
          lt: new Date("2026-08-29T07:00:00Z"),
        },
        projectId: "prj_1",
        property: "sc-domain:example.com",
      },
    });
  });
});
