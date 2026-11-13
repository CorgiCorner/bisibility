import { describe, expect, it } from "vitest";
import { metricBand, pageVitalsStatus } from "./thresholds";

describe("Core Web Vitals thresholds", () => {
  it.each([
    ["lcp", 2500, "good"],
    ["lcp", 2501, "needs_improvement"],
    ["lcp", 4000, "needs_improvement"],
    ["lcp", 4001, "poor"],
    ["inp", 200, "good"],
    ["inp", 201, "needs_improvement"],
    ["inp", 500, "needs_improvement"],
    ["inp", 501, "poor"],
    ["cls", 0.1, "good"],
    ["cls", 0.11, "needs_improvement"],
    ["cls", 0.25, "needs_improvement"],
    ["cls", 0.26, "poor"],
  ] as const)("rates %s %s as %s", (metric, value, status) => {
    expect(metricBand(metric, value)).toBe(status);
  });

  it("passes only when every available metric is good", () => {
    expect(pageVitalsStatus({ cls: 0.02, inpMs: 120, lcpMs: 2100 })).toBe("good");
    expect(pageVitalsStatus({ cls: 0.02, inpMs: null, lcpMs: 2100 })).toBe("good");
    expect(pageVitalsStatus({ cls: 0.18, inpMs: 120, lcpMs: 2100 })).toBe("needs_improvement");
    expect(pageVitalsStatus({ cls: 0.02, inpMs: 620, lcpMs: 2100 })).toBe("poor");
    expect(pageVitalsStatus({ cls: null, inpMs: null, lcpMs: null })).toBe("unknown");
  });
});
