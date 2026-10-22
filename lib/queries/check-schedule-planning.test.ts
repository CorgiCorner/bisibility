import { afterEach, expect, it, vi } from "vitest";
import { hasEnabledKeywordSchedule } from "./check-schedule-planning";

const mocks = vi.hoisted(() => ({ schedules: vi.fn(), markets: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    checkSchedule: { findFirst: mocks.schedules },
    projectMarket: { findMany: mocks.markets },
  },
}));
afterEach(() => vi.resetAllMocks());
it("only explains waiting for a current enabled owner-project schedule with runnable keywords", async () => {
  mocks.markets.mockResolvedValue([{ locationId: "active_market" }]);
  mocks.schedules.mockResolvedValue({ id: "schedule" });
  expect(await hasEnabledKeywordSchedule("project_a")).toBe(true);
  expect(mocks.markets).toHaveBeenCalledWith({
    select: { locationId: true },
    where: { projectId: "project_a", status: "active" },
  });
  expect(mocks.schedules).toHaveBeenCalledWith({
    select: { id: true },
    where: {
      projectId: "project_a",
      archivedAt: null,
      enabled: true,
      frequency: { in: ["daily", "weekly", "monthly", "custom_cron"] },
      keywords: {
        some: { projectId: "project_a", archivedAt: null, locationId: { in: ["active_market"] } },
      },
    },
  });
});
it("does not suggest waiting when no applicable schedule exists", async () => {
  mocks.markets.mockResolvedValue([]);
  mocks.schedules.mockResolvedValue(null);
  expect(await hasEnabledKeywordSchedule("project_a")).toBe(false);
});
