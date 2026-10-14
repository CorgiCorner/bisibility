import { beforeEach, describe, expect, it, vi } from "vitest";
import { legacyAsOf, legacyReportOptions } from "./legacy-dashboard.test-fixture";
import {
  getProjectMarketMocks,
  options,
  resetProjectMarketMocks,
} from "./project-markets.test-fixture";

const mocks = getProjectMarketMocks();
const { getProjectMarkets } = await import("./project-markets");
beforeEach(resetProjectMarketMocks);
describe("legacy market visibility scope", () => {
  it("does not read quality, costs or project data after access is revoked", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("Denied"));
    await expect(getProjectMarkets("foreign-project", options)).rejects.toThrow("Denied");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
    expect(mocks.monthlyTrackingCostCents).not.toHaveBeenCalled();
  });
  it.each(["missing-definition", "stale"])(
    "keeps unavailable current Top3 for %s proof instead of trusting stored positions",
    async (kind) => {
      const report = legacyReportOptions(
        legacyAsOf,
        "project_1",
        kind === "missing-definition" ? { scope: null } : { freshForMs: 1 },
      );
      const result = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", {
        now: legacyAsOf,
        report,
      });
      expect(result.markets[0]).toMatchObject({
        activeKeywordCount: 2,
        currentVisibility: null,
        topThreeCount: null,
      });
    },
  );
  it("performs no provider HTTP I/O while reading active/paused legacy market visibility", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const result = await getProjectMarkets("prj_abcdefghijklmnopqrstuvwx", options);
      expect(result.markets.map((row) => [row.status, row.currentVisibility])).toEqual([
        ["active", 50],
        ["paused", null],
      ]);
      expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "RepeatableRead",
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
