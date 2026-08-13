import { describe, expect, it, vi } from "vitest";
import { createDataForSeoDomainMethods } from "./dataforseo-domain";
import type { DataForSeoResponse } from "./dataforseo-payload";
import historySuccess from "./fixtures/domain-overview/history-success.json";
import overviewSuccess from "./fixtures/domain-overview/overview-success.json";
import pagesSuccess from "./fixtures/domain-overview/pages-success.json";

const credentials = { login: "login", password: "secret" };
const location = {
  gl: "us",
  hl: "en",
  primaryGeoCode: 2840,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
} as const;

function response(value: unknown) {
  return value as DataForSeoResponse;
}

const locationParams = vi.fn(() => ({ language_code: "en", location_code: 2840 }));
const statusSuccess = response({
  status_code: 20000,
  tasks: [
    {
      status_code: 20000,
      result: [{ google: { date_update: "2026-08-04" } }],
    },
  ],
});

function methodsWith(request: ReturnType<typeof vi.fn>, requestStatus = vi.fn()) {
  requestStatus.mockResolvedValue(statusSuccess);
  type Dependencies = Parameters<typeof createDataForSeoDomainMethods>[0];
  return {
    methods: createDataForSeoDomainMethods({
      locationParams,
      request: request as unknown as Dependencies["request"],
      requestStatus: requestStatus as unknown as Dependencies["requestStatus"],
    }),
    requestStatus,
  };
}

describe("createDataForSeoDomainMethods", () => {
  it("calls the overview endpoint with target and location params (no include_subdomains)", async () => {
    const request = vi.fn().mockResolvedValue(response(overviewSuccess));
    const { methods, requestStatus } = methodsWith(request);

    await expect(
      methods.fetchDomainRankOverview(credentials, {
        target: "example.com",
        includeSubdomains: true,
        location,
      }),
    ).resolves.toMatchObject({
      costCents: 2,
      metrics: { etv: 15420.5 },
      sourceSnapshotAt: "2026-08-04T00:00:00.000Z",
    });

    expect(requestStatus).toHaveBeenCalledWith(credentials);
    expect(requestStatus.mock.invocationCallOrder[0]).toBeLessThan(
      request.mock.invocationCallOrder[0] ?? 0,
    );

    expect(request).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live",
      credentials,
      {
        target: "example.com",
        language_code: "en",
        location_code: 2840,
      },
    );
  });

  it("does not issue the paid overview request when Labs Status fails", async () => {
    const request = vi.fn().mockResolvedValue(response(overviewSuccess));
    const requestStatus = vi.fn().mockRejectedValue(new Error("status unavailable"));
    const methods = createDataForSeoDomainMethods({ locationParams, request, requestStatus });

    await expect(
      methods.fetchDomainRankOverview(credentials, {
        target: "example.com",
        includeSubdomains: true,
        location,
      }),
    ).rejects.toThrow("status unavailable");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not issue the paid overview request without a valid source snapshot date", async () => {
    const request = vi.fn().mockResolvedValue(response(overviewSuccess));
    const requestStatus = vi.fn().mockResolvedValue(
      response({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ google: {} }] }],
      }),
    );
    const methods = createDataForSeoDomainMethods({ locationParams, request, requestStatus });

    await expect(
      methods.fetchDomainRankOverview(credentials, {
        includeSubdomains: true,
        location,
        target: "example.com",
      }),
    ).rejects.toThrow("valid Google source snapshot date");
    expect(request).not.toHaveBeenCalled();
  });

  it("uses direct market codes supplied by Domain Overview", async () => {
    const request = vi.fn().mockResolvedValue(response(overviewSuccess));
    const { methods } = methodsWith(request);

    await methods.fetchDomainRankOverview(credentials, {
      includeSubdomains: false,
      languageCode: "pl",
      location,
      locationCode: 2616,
      target: "example.com",
    });

    expect(request).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live",
      credentials,
      { language_code: "pl", location_code: 2616, target: "example.com" },
    );
  });

  it("passes date_from/date_to only when present on history", async () => {
    const request = vi.fn().mockResolvedValue(response(historySuccess));
    const { methods } = methodsWith(request);

    await expect(
      methods.fetchHistoricalRankOverview(credentials, {
        target: "example.com",
        includeSubdomains: false,
        location,
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
      }),
    ).resolves.toMatchObject({
      costCents: 2,
      rows: [{ year: 2025, month: 7, metrics: { etv: 12000 } }, { month: 8 }],
    });

    expect(request).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live",
      credentials,
      {
        target: "example.com",
        language_code: "en",
        location_code: 2840,
        date_from: "2025-01-01",
        date_to: "2025-12-31",
      },
    );
  });

  it("omits date_from/date_to when absent on history", async () => {
    const request = vi.fn().mockResolvedValue(response(historySuccess));
    const { methods } = methodsWith(request);

    await methods.fetchHistoricalRankOverview(credentials, {
      target: "example.com",
      includeSubdomains: false,
      location,
    });

    const payload = request.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload.date_from).toBeUndefined();
    expect(payload.date_to).toBeUndefined();
  });

  it("clamps limit to 1..1000 without changing a valid large offset", async () => {
    const request = vi.fn().mockResolvedValue(response(pagesSuccess));
    const { methods } = methodsWith(request);

    await methods.fetchRelevantPages(credentials, {
      target: "example.com",
      includeSubdomains: true,
      location,
      limit: 5_000,
      offset: 50_000,
    });

    expect(request).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/relevant_pages/live",
      credentials,
      {
        target: "example.com",
        language_code: "en",
        location_code: 2840,
        limit: 1_000,
        offset: 50_000,
        order_by: ["metrics.organic.etv,desc"],
      },
    );
  });
});
