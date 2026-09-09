import { appendFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findSnapshot: vi.fn(),
  paidCall: vi.fn(),
  persistHistory: vi.fn(),
  preflight: vi.fn(),
  read: vi.fn(),
  requireSource: vi.fn(),
  withCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { domainOverviewSnapshot: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/provider-lookups/cache", () => ({
  positiveTtl: (raw: string | undefined, fallback: number) => Number(raw) || fallback,
  readProviderLookupCache: mocks.read,
  withProviderLookupCache: mocks.withCache,
}));
vi.mock("@/lib/provider-lookups/paid-call", () => {
  class ProviderLookupSignal extends Error {
    constructor(readonly outcome: { costCents?: number; ok: false; reason: string }) {
      super(outcome.reason);
    }
  }
  return {
    ProviderLookupSignal,
    paidProviderCall: mocks.paidCall,
    preflightProviderBudget: mocks.preflight,
    requiredEstimatedCostCents: () => 1,
  };
});
vi.mock("./context", () => ({ requireDomainOverviewSource: mocks.requireSource }));
vi.mock("./snapshot", () => ({
  findDomainOverviewSnapshot: mocks.findSnapshot,
  findDomainOverviewSnapshotMetadata: vi.fn(),
  persistDomainOverviewHistory: mocks.persistHistory,
  persistDomainOverviewModules: vi.fn(),
  resolveDomainOverviewSnapshot: vi.fn(),
}));

type Module = Record<string, (...args: never[]) => unknown>;

const provider = {
  fetchDomainRankOverview: vi.fn(),
  fetchHistoricalRankOverview: vi.fn(),
  fetchRankedKeywords: vi.fn(),
  fetchRelevantPages: vi.fn(),
  id: "dataforseo",
  label: "Research provider",
};
const source = {
  connection: { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
  provider,
};

function asModule(value: unknown) {
  return value as Module;
}

function trace(value: unknown) {
  const json = JSON.stringify(value);
  const traceFile = process.env.DOMAIN_OVERVIEW_CHARACTERIZATION_TRACE_FILE;
  if (traceFile) appendFileSync(traceFile, `${json}\n`);
  return JSON.parse(json) as unknown;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.findSnapshot.mockResolvedValue({ id: "snapshot_1" });
  mocks.persistHistory.mockResolvedValue({ id: "snapshot_1" });
  mocks.read.mockResolvedValue(null);
  mocks.requireSource.mockResolvedValue({
    project: { budgetCapCents: 500, id: "project_1" },
    source,
  });
  mocks.withCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) => ({
    cached: false,
    status: "success",
    value: await load(),
  }));
  mocks.paidCall.mockImplementation(async ({ call }: { call: (credentials: object) => unknown }) =>
    call({}),
  );
  provider.fetchDomainRankOverview.mockResolvedValue({
    costCents: 1,
    metrics: null,
    sourceSnapshotAt: null,
  });
  provider.fetchHistoricalRankOverview.mockResolvedValue({ costCents: 10, rows: [] });
});

afterEach(() => vi.useRealTimers());

describe("domain overview provider and service characterization", () => {
  it.each([
    [
      "country-specific request",
      { countryCode: "PL", languageCode: "pl", locationCode: 2616 },
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
    ],
    [
      "numeric-only request",
      { languageCode: "en", locationCode: 2840 },
      {
        includeSubdomains: true,
        languageCode: "en",
        location: {
          gl: "",
          hl: "en",
          primaryGeoCode: 2840,
          primaryGeoName: "",
          secondaryGeoName: "",
        },
        locationCode: 2840,
        target: "example.com",
      },
    ],
  ])("provider calls preserve the %s payload", async (_name, researchScope, expectedRequest) => {
    const providerCall = asModule(await import("./provider-call"));
    const fetchMetrics = providerCall.fetchDomainOverviewMetrics as (
      input: unknown,
    ) => Promise<unknown>;
    await fetchMetrics({
      ...researchScope,
      budgetCapCents: 500,
      projectId: "project_1",
      scope: "root",
      source,
      target: "example.com",
    });
    expect(trace(provider.fetchDomainRankOverview.mock.calls[0]?.[1])).toEqual(expectedRequest);
  });

  it.each([
    [
      "expired replay",
      null,
      {
        historyRequest: null,
        result: { costCents: 0, ok: false, reason: "snapshot_expired" },
      },
    ],
    [
      "live replay",
      { id: "snapshot_1" },
      {
        historyRequest: {
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
        result: {
          cached: false,
          costCents: 10,
          data: [],
          fetchedAt: "2026-08-11T12:00:00.000Z",
          ok: true,
        },
      },
    ],
  ])("service preserves the %s outcome", async (_name, snapshot, expected) => {
    mocks.findSnapshot.mockResolvedValue(snapshot);
    const service = asModule(await import("./service"));
    const loadHistory = service.loadDomainOverviewHistory as (
      context: unknown,
      options: unknown,
    ) => Promise<unknown>;
    const result = await loadHistory(
      { projectId: "project_1" },
      { countryCode: "PL", languageCode: "pl", locationCode: 2616, target: "example.com" },
    );
    expect(
      trace({
        historyRequest: provider.fetchHistoricalRankOverview.mock.calls[0]?.[1] ?? null,
        result,
      }),
    ).toEqual(expected);
  });

  it.each([
    [
      "a live legacy city row",
      [
        {
          cachedUntil: new Date("2026-08-12T00:00:00.000Z"),
          fetchedAt: new Date("2026-08-11T12:00:00.000Z"),
          languageCode: "en",
          locationCode: 1_026_201,
          scope: "subdomain",
          target: "shop.example.com",
        },
      ],
      [
        {
          cachedUntil: "2026-08-12T00:00:00.000Z",
          fetchedAt: "2026-08-11T12:00:00.000Z",
          languageCode: "en",
          locationCode: 1_026_201,
          scope: "subdomain",
          target: "shop.example.com",
        },
      ],
    ],
    ["no rows after expiry filtering", [], []],
  ])("recent targets preserve %s", async (_name, rows, expected) => {
    mocks.findMany.mockResolvedValue(rows);
    const recent = asModule(await import("./recent"));
    const targets = await (
      recent.recentDomainOverviewTargets as (
        projectId: string,
        limit: number,
        now: Date,
      ) => Promise<unknown>
    )("project_1", 2, new Date("2026-08-11T20:00:00.000Z"));
    expect(trace(targets)).toEqual(expected);
  });
});
