import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertDomainOverviewMaxCost,
  domainOverviewCostReservation,
  domainOverviewEstimate,
  fetchDomainKeywords,
  fetchDomainOverviewMetrics,
} from "./provider-call";

const mocks = vi.hoisted(() => ({
  paidCall: vi.fn(),
  preflightBudget: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-lookups/paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: mocks.paidCall,
  preflightProviderBudget: mocks.preflightBudget,
}));

const provider = {
  fetchDomainRankOverview: vi.fn(),
  fetchHistoricalRankOverview: vi.fn(),
  fetchRank: vi.fn(),
  fetchRankedKeywords: vi.fn(),
  fetchRelevantPages: vi.fn(),
  id: "dataforseo",
  label: "DataForSEO",
  testConnection: vi.fn(),
};
const source = {
  connection: {
    credentialsEncrypted: "encrypted",
    id: "connection_1",
    provider: "dataforseo",
  },
  provider,
};
const market = {
  languageCode: "pl",
  locationCode: 2616,
};

describe("domain overview provider calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paidCall.mockImplementation(
      ({ call }: { call: (credentials: object) => Promise<unknown> }) => call({ apiKey: "test" }),
    );
  });

  it("estimates provisional module costs and keeps history at 10x overview", () => {
    const estimate = domainOverviewEstimate({ keywordLimit: 100, pageLimit: 100, source });

    expect(estimate.overview).toBeCloseTo(1.212);
    expect(estimate.history).toBeCloseTo(12.12);
    expect(estimate.history / estimate.overview).toBe(10);
    expect(estimate.keywords).toBe(2);
    expect(estimate.pages).toBeCloseTo(2.4);
    expect(estimate.core).toBeCloseTo(estimate.overview + estimate.keywords + estimate.pages);
  });

  it("rejects an estimate above the caller max cost", () => {
    expect(() => assertDomainOverviewMaxCost(12, 12)).not.toThrow();

    try {
      assertDomainOverviewMaxCost(12.01, 12);
      expect.unreachable("expected the max-cost guard to reject the call");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderLookupSignal);
      expect((error as ProviderLookupSignal).outcome).toEqual({
        ok: false,
        reason: "cost_limit_exceeded",
      });
    }
  });

  it("enforces the caller max across concurrent module reservations", () => {
    const reserve = domainOverviewCostReservation(4);
    reserve(1);
    reserve(2);
    expect(() => reserve(2)).toThrow(ProviderLookupSignal);
  });

  it("charges domain_overview and forwards the direct numeric market", async () => {
    provider.fetchDomainRankOverview.mockResolvedValue({
      costCents: 1.2,
      metrics: null,
      sourceSnapshotAt: "2026-07-22T00:00:00.000Z",
    });

    await fetchDomainOverviewMetrics({
      ...market,
      budgetCapCents: 500,
      projectId: "project_1",
      scope: "root",
      source,
      target: "example.com",
    });

    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetCapCents: 500,
        connection: source.connection,
        feature: "domain_overview",
        itemCount: 1,
        projectId: "project_1",
        provider,
      }),
    );
    expect(provider.fetchDomainRankOverview).toHaveBeenCalledWith(
      { apiKey: "test" },
      {
        includeSubdomains: true,
        languageCode: "pl",
        location: {
          gl: "",
          hl: "pl",
          primaryGeoCode: 2616,
          primaryGeoName: "",
          secondaryGeoName: "",
        },
        locationCode: 2616,
        target: "example.com",
      },
    );
  });

  it("forwards direct location and language codes to ranked keywords", async () => {
    provider.fetchRankedKeywords.mockResolvedValue({ costCents: 2, rows: [], totalCount: 0 });

    await fetchDomainKeywords({
      ...market,
      budgetCapCents: 500,
      limit: 25,
      offset: 50,
      projectId: "project_1",
      source,
      target: "example.com",
    });

    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "domain_overview", itemCount: 25 }),
    );
    expect(provider.fetchRankedKeywords).toHaveBeenCalledWith(
      { apiKey: "test" },
      expect.objectContaining({
        domain: "example.com",
        languageCode: "pl",
        locationCode: 2616,
      }),
    );
  });
});
