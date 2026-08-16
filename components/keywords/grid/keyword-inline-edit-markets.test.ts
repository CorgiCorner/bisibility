import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { describe, expect, it } from "vitest";
import { drawerMarketOptions } from "./keyword-inline-edit-markets";

type RegistryMarket = ProjectMarketsView["markets"][number];

function market(overrides: Partial<RegistryMarket> = {}): RegistryMarket {
  return {
    canonicalKey: "US",
    countryCode: "US",
    displayName: "United States",
    id: "pm_us",
    languageCode: "en",
    languageLabel: "English",
    monthlyCostCents: null,
    researchAvailable: true,
    status: "active",
    ...overrides,
  };
}

function keyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return {
    bestPosition: 3,
    cpc: "0.00",
    checkState: "ranked",
    clicks: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ctr: null,
    device: "Desktop",
    difficulty: 0,
    engine: "Google",
    hasRankData: true,
    id: "kw_1",
    impressions: null,
    keyword: "rank tracker",
    lastCheckAt: null,
    lastCheckStatus: null,
    location: {
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      id: "loc_us",
      kind: "country",
    },
    locationName: "United States",
    position: 3,
    positionBaseline: 4,
    positionHistory: [],
    positionHistoryBoundaryAt: null,
    previousPosition: 4,
    rankingPages: 1,
    rankingPath: "/",
    rankingUrl: "https://example.com/",
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: "daily",
      jitter_minutes: 60,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    serpFeatures: [],
    sparkline: [],
    tags: [],
    targetUrl: null,
    topic: null,
    intent: null,
    volume: 0,
    ...overrides,
  };
}

describe("drawerMarketOptions", () => {
  it("marks the current key as disabled with no-longer-in-registry when absent from the registry", () => {
    const kw = keyword({
      location: {
        canonicalKey: "ES@ca",
        cityName: null,
        countryCode: "ES",
        displayName: "Spain",
        gl: "es",
        hl: "ca",
        id: "loc_es_ca",
        kind: "country",
      },
      locationName: "Spain",
    });
    const options = drawerMarketOptions([market()], "ES@ca", kw);
    const legacy = options[0];
    expect(legacy).toMatchObject({
      disabled: true,
      languageCode: "ca",
      languageLabel: "",
      locationLabel: "Spain",
      payload: "ES@ca",
      secondary: "no longer in registry",
      tooltip: "This market is no longer available in the project registry.",
      value: "ES@ca",
    });
  });

  it("marks paused registry markets as disabled with the paused secondary text", () => {
    const paused = market({
      canonicalKey: "BE@fr",
      countryCode: "BE",
      displayName: "Belgium",
      id: "pm_be_fr",
      languageCode: "fr",
      languageLabel: "French",
      status: "paused",
    });
    const options = drawerMarketOptions([paused], "BE@fr", keyword());
    const option = options[0];
    expect(option).toMatchObject({
      disabled: true,
      languageCode: "fr",
      languageLabel: "French",
      locationLabel: "Belgium",
      payload: "BE@fr",
      secondary: "paused",
      tooltip: "Enable this market in Settings before selecting it.",
      value: "BE@fr",
    });
  });

  it("preserves full labels, codes, and payloads for active markets", () => {
    const active = market({
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "Spain",
      id: "pm_es",
      languageCode: "es",
      languageLabel: "Spanish",
    });
    const options = drawerMarketOptions([active], "ES", keyword());
    expect(options[0]).toMatchObject({
      countryCode: "ES",
      disabled: false,
      languageCode: "es",
      languageLabel: "Spanish",
      locationLabel: "Spain",
      payload: "ES",
      value: "ES",
    });
  });
});
