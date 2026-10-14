import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
import { reportAsOf, reportProject } from "@/lib/rank-reports/report-test-fixture";
import { describe, expect, it, vi } from "vitest";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { selectRankTrackerReportKeywords } from "./rank-tracker-report-selection";

const transaction = vi.fn();
function options(): RankTrackerReportOptions {
  return {
    asOf: reportAsOf,
    db: { $transaction: transaction },
    policyAt: (at) => hostOrganicReportPolicy(at, 7),
    loadMetadata: async () => new Map(),
    limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
  };
}
const context = { actor: { id: "verified-session" }, transport: "session" as const };
describe("General exact report-time fence", () => {
  it.each([
    {
      view: "general" as const,
      subject: null,
      comparisonDays: 28 as const,
      asOf: reportAsOf.toISOString(),
    },
    {
      view: "general" as const,
      subject: null,
      comparisonDays: 7 as const,
      asOf: "2026-10-11T12:00:00.000Z",
    },
    { view: "local" as const, subject: null, comparisonDays: 7 as const, asOf: null },
  ])(
    "refuses conflicting time/period/surface before any database read: %j",
    async (reportScope) => {
      transaction.mockClear();
      await expect(
        selectRankTrackerReportKeywords(
          context,
          {
            projectRef: reportProject.publicId,
            query: { ...defaultRankTrackerQueryState, reportScope },
          },
          options(),
        ),
      ).rejects.toThrow();
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
