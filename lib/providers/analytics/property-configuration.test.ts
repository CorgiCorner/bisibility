import { classifyProviderFailure } from "@/lib/providers/failure-class";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ga4AnalyticsProvider } from "./ga4";
import { gscAnalyticsProvider } from "./gsc";

describe("stored Google property configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      "GA4 Measurement ID",
      () =>
        ga4AnalyticsProvider.fetchReport({
          credentials: { apiKey: "refresh_token", login: "G-Y67LRWFT7X" },
          endDate: "today",
          startDate: "yesterday",
        }),
      "Measurement ID for a web data stream",
    ],
    [
      "invalid GSC property",
      () =>
        gscAnalyticsProvider.fetchSearchAnalytics({
          credentials: { apiKey: "refresh_token", login: "not-a-property" },
          endDate: "2026-07-19",
          startDate: "2026-07-18",
        }),
      "not a valid Search Console property",
    ],
  ])("classifies a stored %s before calling Google", async (_label, run, expectedMessage) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await run().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(expectedMessage);
    expect(classifyProviderFailure(error)).toBe("config_invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
