import { afterEach, describe, expect, it, vi } from "vitest";

describe("domain overview date labels", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps source and history dates on their UTC calendar values", async () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    vi.resetModules();
    const { historyLabel, sourceDateLabel } = await import("./domain-overview-metrics");

    expect(sourceDateLabel("2026-08-05T00:00:00.000Z")).toBe("Aug 5");
    expect(historyLabel({ month: 8, year: 2026 })).toBe("Aug 2026");
  });
});
