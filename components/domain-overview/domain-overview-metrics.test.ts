import projectDomainOverviewMessages from "@/messages/core/en/project-domain-overview.json";
import { createTranslator } from "use-intl/core";
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
    const t = createTranslator({
      locale: "en",
      messages: projectDomainOverviewMessages,
      namespace: "projectDomainOverview.workspace.ui",
    });

    expect(sourceDateLabel("2026-08-05T00:00:00.000Z", "month_first", t)).toBe("Aug 5");
    expect(historyLabel({ month: 8, year: 2026 })).toBe("Aug 2026");
  });
});
