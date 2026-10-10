import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ run: vi.fn(), samples: vi.fn() }));
vi.mock("@/lib/api/ai-tracking-service", () => ({
  trackingRun: service.run,
  trackingSamples: service.samples,
}));

import { trackingTrends } from "@/lib/api/ai-tracking-trends";

function sample(category: string, mentioned: boolean, identity = category) {
  return {
    plan: { promptCategory: category },
    promptRevisionId: `revision-${identity}`,
    configurationHash: "configuration",
    measurement: "answer_present",
    evidence: { recordedSource: "fresh", effectiveLocale: null, actualModel: "fixed-model" },
    observations: [{ competitorId: null, mentioned }],
  };
}
function period(samples: ReturnType<typeof sample>[], nextCursor: string | null = null) {
  return {
    run: { publicId: "air_period", state: "completed", competitorSnapshot: [], samples },
    page: { items: samples, nextCursor },
  };
}
function prepare(previous: ReturnType<typeof period>, current: ReturnType<typeof period>) {
  service.run.mockImplementation(async (_project: string, id: string) =>
    id === "current" ? current.run : previous.run,
  );
  service.samples.mockImplementation(async (_project: string, id: string) =>
    id === "current" ? current.page : previous.page,
  );
}
beforeEach(() => vi.resetAllMocks());

describe("stored category and evidence reach the trend API consistently", () => {
  it("keeps branded changes out of the neutral baseline and exposes both strata", async () => {
    prepare(
      period([sample("neutral", false), sample("branded", true)]),
      period([sample("neutral", false), sample("branded", false)]),
    );
    const result = await trackingTrends("project", "current", "previous");
    expect(result).toMatchObject({ baseline: "neutral", comparable: true, delta: 0 });
    if (!("strata" in result)) throw new Error("Compared periods must expose category strata.");
    expect(result.strata.find((stratum) => stratum.category === "branded")).toMatchObject({
      comparable: true,
      delta: -1,
    });
    expect(result.current.expected).toBe(1);
  });

  it("refuses a baseline when a frozen prompt category changes", async () => {
    prepare(period([sample("neutral", true, "same")]), period([sample("branded", true, "same")]));
    expect(await trackingTrends("project", "current", "previous")).toMatchObject({
      comparable: false,
      delta: null,
      reason: "Configuration changed",
    });
  });

  it("fails closed for evidence pages that do not contain the full period", async () => {
    prepare(period([sample("neutral", true)]), period([sample("neutral", true)], "cursor"));
    expect(await trackingTrends("project", "current", "previous")).toMatchObject({
      comparable: false,
      delta: null,
      reason: "Comparison exceeds the 100-sample evidence window; narrow the corpus",
    });
  });
});
