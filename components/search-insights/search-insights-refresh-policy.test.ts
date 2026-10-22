import { describe, expect, it } from "vitest";
import {
  searchInsightsRefreshIntervalMs,
  searchInsightsSelfResolving,
} from "./search-insights-refresh-policy";

const selfResolving = ["queued", "running", "status_unavailable", "waiting_worker"] as const;

describe("search insights refresh policy", () => {
  it("auto-refreshes every self-resolving state and keeps running on the shorter interval", () => {
    for (const kind of selfResolving) expect(searchInsightsSelfResolving(kind)).toBe(true);
    expect(searchInsightsSelfResolving("paused_user")).toBe(false);
    expect(searchInsightsSelfResolving("needs_reauth")).toBe(false);
    expect(searchInsightsRefreshIntervalMs("running")).toBe(45_000);
    expect(searchInsightsRefreshIntervalMs("queued")).toBe(90_000);
    expect(searchInsightsRefreshIntervalMs("status_unavailable")).toBe(90_000);
    expect(searchInsightsRefreshIntervalMs("waiting_worker")).toBe(90_000);
  });
});
