import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertDomainOverviewMaxCost,
  domainOverviewCostReservation,
  domainOverviewEstimate,
  fetchDomainKeywords,
  fetchDomainOverviewMetrics,
  preflightDomainOverview,
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
const researchScope = {
  countryCode: "PL",
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

  it("estimates module costs from the measured list rates", () => {
    const estimate = domainOverviewEstimate({ keywordLimit: 100, pageLimit: 100, source });

    expect(estimate.overview).toBe(2);
    expect(estimate.history).toBeCloseTo(12.12);
    expect(estimate.keywords).toBe(2);
    expect(estimate.pages).toBe(2);
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
        estimatedCostCents: 12.01,
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

  it("keeps the aggregate preflight as a thin connection-aware wrapper", async () => {
    const origin = {
      credential: { id: "key_1", kind: "project_key" as const },
      source: "sdk" as const,
    };

    await preflightDomainOverview({
      budgetCapCents: 500,
      connectionId: "connection_1",
      estimatedCostCents: 6,
      estimatedUsageQuantity: 3,
      origin,
      projectId: "project_1",
      provider: "dataforseo",
    });

    expect(mocks.preflightBudget).toHaveBeenCalledWith({
      budgetCapCents: 500,
      connectionId: "connection_1",
      estimatedCostCents: 6,
      estimatedUsageQuantity: 3,
      origin,
      projectId: "project_1",
      provider: "dataforseo",
      surface: "programmatic",
    });
  });

  it("charges domain_overview and forwards the direct numeric location", async () => {
    provider.fetchDomainRankOverview.mockResolvedValue({
      costCents: 1.2,
      metrics: null,
      sourceSnapshotAt: "2026-07-22T00:00:00.000Z",
    });

    await fetchDomainOverviewMetrics({
      ...researchScope,
      budgetCapCents: 500,
      origin: APP_REQUEST_ORIGIN,
      projectId: "project_1",
      scope: "root",
      source,
      target: "example.com",
    });

    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({
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
          gl: "pl",
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
      ...researchScope,
      budgetCapCents: 500,
      limit: 25,
      offset: 50,
      origin: APP_REQUEST_ORIGIN,
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

  it("threads the paying request origin into every paid provider call", async () => {
    const origin = {
      credential: { id: "key_1", kind: "project_key" as const },
      source: "sdk" as const,
    };
    provider.fetchDomainRankOverview.mockResolvedValue({
      costCents: 1.2,
      metrics: null,
      sourceSnapshotAt: null,
    });
    provider.fetchRankedKeywords.mockResolvedValue({ costCents: 2, rows: [], totalCount: 0 });

    await fetchDomainOverviewMetrics({
      ...researchScope,
      budgetCapCents: 500,
      origin,
      projectId: "project_1",
      scope: "root",
      source,
      target: "example.com",
    });
    await fetchDomainKeywords({
      ...researchScope,
      budgetCapCents: 500,
      limit: 25,
      offset: 0,
      origin,
      projectId: "project_1",
      source,
      target: "example.com",
    });

    expect(mocks.paidCall).toHaveBeenCalled();
    for (const [input] of mocks.paidCall.mock.calls) {
      expect(input).toMatchObject({
        credential: { id: "key_1", kind: "project_key" },
        source: "sdk",
        trigger: "manual",
      });
    }
  });
});
