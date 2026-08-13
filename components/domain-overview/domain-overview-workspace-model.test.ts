import { describe, expect, it } from "vitest";
import {
  cacheHoursRemaining,
  detectedDomainScope,
  estimateView,
  failureCharge,
  failureState,
  reportUrl,
  supportedMarket,
} from "./domain-overview-workspace-model";
import { domainOverviewMarketFixture } from "./fixtures";

describe("domain overview workspace model", () => {
  it("detects registrable domains and subdomains", () => {
    expect(detectedDomainScope("https://example.com/path")).toBe("root");
    expect(detectedDomainScope("blog.example.co.uk")).toBe("subdomain");
    expect(detectedDomainScope("not a domain")).toBeNull();
  });

  it("maps estimates and failures without inventing successful data", () => {
    expect(
      estimateView({
        cached: true,
        estimate: true,
        estimatedCostCents: 4,
        freshEstimatedCostCents: 6,
        historyEstimatedCostCents: 12,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: 2,
        languageCode: "en",
        locationCode: 2840,
        ok: true,
        pagePageEstimatedCostCents: 3,
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      }),
    ).toMatchObject({
      cached: true,
      costCents: 4,
      freshCostCents: 6,
      historyCostCents: 12,
      keywordPageCostCents: 2,
      pagePageCostCents: 3,
      valid: true,
    });
    expect(failureState({ costCents: 0, ok: false, reason: "no_source" })).toBe("no_provider");
    expect(failureState({ costCents: 2, ok: false, reason: "lookup_failed" })).toBe(
      "lookup_failed",
    );
    expect(failureState({ costCents: 0, ok: false, reason: "in_progress", resetAt: 123 })).toBe(
      "in_progress",
    );
    expect(failureState({ costCents: 0, ok: false, reason: "rate_limited" })).toBe("rate_limited");
    expect(failureState({ costCents: 0, ok: false, reason: "cost_limit_exceeded" })).toBe(
      "cost_limit_exceeded",
    );
    expect(failureState({ costCents: 0, ok: false, reason: "snapshot_expired" })).toBe(
      "snapshot_expired",
    );
    expect(failureCharge({ charged: null, ok: false, reason: "lookup_failed" })).toBeNull();
    expect(failureCharge({ costCents: 0, ok: false, reason: "lookup_failed" })).toBe(false);
    expect(failureCharge({ costCents: 3, ok: false, reason: "lookup_failed" })).toBe(true);
  });

  it("keeps market and report URL dimensions explicit", () => {
    expect(supportedMarket({ ...domainOverviewMarketFixture, locationCode: null })).toBeNull();
    expect(supportedMarket(domainOverviewMarketFixture)).toEqual(domainOverviewMarketFixture);
    expect(
      reportUrl({
        market: domainOverviewMarketFixture,
        projectRef: "prj_1",
        scope: "subdomain",
        target: "blog.example.com",
      }),
    ).toBe(
      "/app/prj_1/domain-overview?domain=blog.example.com&market=US%2FUS-TX%2FAustin&scope=subdomain",
    );
  });

  it("rounds remaining cache time up and never below zero", () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    expect(cacheHoursRemaining("2026-08-12T13:01:00.000Z", now)).toBe(2);
    expect(cacheHoursRemaining("2026-08-12T11:00:00.000Z", now)).toBe(0);
  });
});
