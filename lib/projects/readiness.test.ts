import { describe, expect, it } from "vitest";
import { computeProjectReadiness, type ReadinessConnection } from "./readiness";

const fullSerpCapabilities = {
  backlinks: true,
  domainOverview: true,
  keywordMetrics: true,
  keywordResearch: true,
  rankChecks: true,
  searchPerformance: false,
};

const searchPerformanceCapabilities = {
  backlinks: false,
  domainOverview: false,
  keywordMetrics: false,
  keywordResearch: false,
  rankChecks: false,
  searchPerformance: true,
};

function serpConnection(overrides: Partial<ReadinessConnection> = {}): ReadinessConnection {
  return {
    ...fullSerpCapabilities,
    enabled: true,
    kind: "serp",
    priority: 0,
    provider: "rank-provider",
    status: "connected",
    ...overrides,
  };
}

function analyticsConnection(overrides: Partial<ReadinessConnection> = {}): ReadinessConnection {
  return {
    ...searchPerformanceCapabilities,
    enabled: true,
    kind: "analytics",
    priority: 0,
    provider: "search-performance-source",
    status: "connected",
    ...overrides,
  };
}

describe("computeProjectReadiness", () => {
  it("marks every area available with the primary rank provider when fully connected", () => {
    const readiness = computeProjectReadiness({
      connections: [serpConnection(), analyticsConnection()],
      tokenScope: "write",
      writeMode: "active",
    });

    expect(readiness).toMatchObject({
      backlinks: { available: true, reason: null },
      domain_overview: { available: true, reason: null },
      keyword_research: { available: true, reason: null },
      search_performance: { available: true, reason: null },
      serp: { available: true, primary_provider: "rank-provider", reason: null },
      token_scope: "write",
      write_mode: "active",
    });
  });

  it("reports provider_not_connected when no connection row exists", () => {
    const readiness = computeProjectReadiness({
      connections: [],
      tokenScope: "write",
      writeMode: "active",
    });

    expect(readiness.serp).toEqual({
      available: false,
      primary_provider: null,
      reason: "provider_not_connected",
    });
    expect(readiness.backlinks).toEqual({ available: false, reason: "provider_not_connected" });
    expect(readiness.search_performance).toEqual({
      available: false,
      reason: "provider_not_connected",
    });
  });

  it("reports provider_disabled when the only capable connection is disabled", () => {
    const readiness = computeProjectReadiness({
      connections: [serpConnection({ enabled: false })],
      tokenScope: "write",
      writeMode: "active",
    });

    expect(readiness.serp).toEqual({
      available: false,
      primary_provider: null,
      reason: "provider_disabled",
    });
  });

  it("reports needs_reauth when the only enabled connection needs reauthorization", () => {
    const readiness = computeProjectReadiness({
      connections: [serpConnection({ status: "needs_reauth" })],
      tokenScope: "write",
      writeMode: "active",
    });

    expect(readiness.serp).toEqual({
      available: false,
      primary_provider: null,
      reason: "needs_reauth",
    });
  });

  it("prefers a usable connection over a disabled one and orders by priority", () => {
    const readiness = computeProjectReadiness({
      connections: [
        serpConnection({ enabled: false, priority: 0, provider: "first-provider" }),
        serpConnection({ priority: 1, provider: "second-provider" }),
        serpConnection({ priority: 0, provider: "third-provider" }),
      ],
      tokenScope: "write",
      writeMode: "active",
    });

    expect(readiness.serp).toEqual({
      available: true,
      primary_provider: "third-provider",
      reason: null,
    });
  });

  it("keeps read areas available for a read-scope token while rank checks are gated", () => {
    const readiness = computeProjectReadiness({
      connections: [serpConnection(), analyticsConnection()],
      tokenScope: "read",
      writeMode: "active",
    });

    expect(readiness.token_scope).toBe("read");
    expect(readiness.serp).toEqual({
      available: false,
      primary_provider: "rank-provider",
      reason: "token_read_only",
    });
    expect(readiness.backlinks).toEqual({ available: true, reason: null });
    expect(readiness.domain_overview).toEqual({ available: true, reason: null });
    expect(readiness.keyword_research).toEqual({ available: true, reason: null });
    expect(readiness.search_performance).toEqual({ available: true, reason: null });
  });

  it("reports project_read_only while a migration hold blocks writes", () => {
    const readiness = computeProjectReadiness({
      connections: [serpConnection()],
      tokenScope: "write",
      writeMode: "migration_hold",
    });

    expect(readiness.serp).toEqual({
      available: false,
      primary_provider: "rank-provider",
      reason: "project_read_only",
    });
    expect(readiness.write_mode).toBe("migration_hold");
    expect(readiness.backlinks).toEqual({ available: true, reason: null });
  });

  it("falls back to provider_not_connected when no capable provider serves an area", () => {
    const readiness = computeProjectReadiness({
      connections: [serpConnection({ backlinks: false })],
      tokenScope: "write",
      writeMode: "active",
    });

    expect(readiness.serp).toMatchObject({ available: true, reason: null });
    expect(readiness.backlinks).toEqual({
      available: false,
      reason: "provider_not_connected",
    });
  });
});
