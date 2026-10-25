import { projectionCounts } from "@/lib/provider-evidence/projection/model";
import { describe, expect, it } from "vitest";
import { heartbeatDeferredText } from "./heartbeat-evidence";

describe("operator evidence classification", () => {
  it("shows independent result/cost classifications without the generic budget hint", () => {
    const evidenceCounts = {
      ...projectionCounts([]),
      under_review: 2,
      partial: 3,
      recovered: 4,
      provider_error: 1,
      missing: 1,
      cost_conflict: 1,
    };
    const text = heartbeatDeferredText({
      deferred: 2,
      deferredReasons: { send_unconfirmed: 2 },
      evidenceCounts,
    });
    expect(text).toContain(
      "2 under review · 4 recovered · 3 partial · 1 provider error · 1 missing · 1 cost conflict",
    );
    expect(text).not.toContain("review provider limits and the project budget");
    expect(text).not.toMatch(/project budget|provider limit/);
  });
  it("labels genuine budget and provider-limit deferrals", () => {
    expect(
      heartbeatDeferredText({
        deferred: 3,
        deferredReasons: { budget_exhausted: 1, rate_limited: 2 },
      }),
    ).toContain("1 project budget · 2 provider limit");
  });
  it("does not guess a cause for legacy unclassified deferrals", () => {
    expect(heartbeatDeferredText({ deferred: 3 })).toContain("classification unavailable");
  });
});
