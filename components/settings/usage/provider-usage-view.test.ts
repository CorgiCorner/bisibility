import {
  featureSourceBuckets,
  featureUsageDisplay,
  formatCount,
  formatUsdCents,
  meterUnconfirmed,
} from "@/components/settings/usage/provider-usage-view";
import { describe, expect, it } from "vitest";

describe("featureSourceBuckets", () => {
  it("groups per-source request counts and hides empty buckets", () => {
    expect(
      featureSourceBuckets(
        {
          bySource: [
            { count: 2, costCents: 4, scheduled: 1, source: "app" },
            { count: 1, costCents: 6, scheduled: 0, source: "api" },
            { count: 3, costCents: 9, scheduled: 2, source: "worker" },
          ],
        },
        { api: "API", app: "App", cli: "CLI", mcp: "MCP", sdk: "SDK" },
      ),
    ).toEqual([
      { count: 5, key: "app", label: "App", scheduled: 3 },
      { count: 1, key: "api", label: "API", scheduled: 0 },
    ]);
  });
});

describe("number formatting", () => {
  it("formats cents as USD and counts per locale", () => {
    expect(formatUsdCents(10, "en-US")).toBe("$0.10");
    expect(formatUsdCents(3000, "en-US")).toBe("$30.00");
    expect(formatCount(1200, "en-US")).toBe("1,200");
  });
});

describe("featureUsageDisplay", () => {
  it("shows a USD amount for metered features", () => {
    expect(
      featureUsageDisplay({ costCents: 12.5, count: 3, quantity: 2, unconfirmedCount: 0 }, "cents"),
    ).toEqual({ kind: "usd", requestCount: 3, unconfirmedCount: 0, usdCents: 12.5 });
  });

  it("shows the native count, not USD, for quota features", () => {
    const display = featureUsageDisplay(
      { costCents: 0, count: 2, quantity: 3, unconfirmedCount: 3 },
      "units",
    );

    expect(display).toEqual({
      kind: "native",
      quantity: 3,
      requestCount: 2,
      unconfirmedCount: 3,
    });
    expect("usdCents" in display).toBe(false);
  });

  it("falls back to a request count when a quota feature has no measurement", () => {
    expect(featureUsageDisplay({ costCents: 0, count: 2, quantity: null }, "units")).toEqual({
      kind: "requests",
      requestCount: 2,
      unconfirmedCount: 0,
    });
  });

  it("treats a missing unconfirmed count as zero", () => {
    expect(featureUsageDisplay({ costCents: 5, count: 1, quantity: null }, "cents")).toEqual({
      kind: "usd",
      requestCount: 1,
      unconfirmedCount: 0,
      usdCents: 5,
    });
  });
});

describe("meterUnconfirmed", () => {
  it("marks a meter with unsettled requests as partial, including a zero confirmed sum", () => {
    expect(meterUnconfirmed(2)).toEqual({ hasUnconfirmed: true, unconfirmedCount: 2 });
    expect(meterUnconfirmed(undefined)).toEqual({ hasUnconfirmed: false, unconfirmedCount: 0 });
    expect(meterUnconfirmed(0)).toEqual({ hasUnconfirmed: false, unconfirmedCount: 0 });
  });
});
