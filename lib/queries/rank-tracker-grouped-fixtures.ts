import type { MarketGridTarget } from "@/lib/keywords/market-grid-model";

type FixtureLocation = MarketGridTarget["location"];
export type GroupedContractTarget = MarketGridTarget & { internalId: string; publicId: string };

const locations: FixtureLocation[] = [
  {
    canonicalKey: "US:en",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "location_us",
    kind: "country",
  },
  {
    canonicalKey: "PL:pl",
    cityName: null,
    countryCode: "PL",
    displayName: "Poland",
    gl: "pl",
    hl: "pl",
    id: "location_pl",
    kind: "country",
  },
  {
    canonicalKey: "DE:de",
    cityName: null,
    countryCode: "DE",
    displayName: "Germany",
    gl: "de",
    hl: "de",
    id: "location_de",
    kind: "country",
  },
];

const terms = ["Alpha", "Beta", "istanbul", "Łódź", "Straße", "İstanbul"];
const variants: Array<[string, number, string]> = [
  ["\u00A0ALPHA\uFEFF", 0, "Desktop"],
  ["\u1680BETA\u202F", 0, "Mobile"],
  ["BETA", 0, "Desktop"],
  ["ISTANBUL", 1, "Desktop"],
  ["İSTANBUL", 0, "Mobile"],
  ["ŁÓDŹ", 0, "Desktop"],
  ["STRAẞE", 0, "Mobile"],
  ["\tStraße\u3000", 0, "Desktop"],
];

function target(keyword: string, index: number, location: FixtureLocation, device: string) {
  const position = ((index % 5) + 1) * 10;
  const baseline = position + (index % 3) - 1;
  const marketStatus = location.id === "location_de" ? "paused" : "active";
  const unknownDifficulty =
    keyword === "Straße" && location.id === "location_us" && device === "Desktop";
  const knownZeroDifficulty =
    keyword === "Beta" && location.id === "location_us" && device === "Desktop";
  const unknownVolume =
    keyword === "İstanbul" && location.id === "location_us" && device === "Desktop";
  return {
    bestPosition: position,
    clicks: index % 3 === 0 ? null : index,
    cpc: "0.00",
    createdAt: "2026-09-01T00:00:00.000Z",
    ctr: index % 4 === 0 ? null : index / 100,
    dataAsOfAt: "2026-09-02T00:00:00.000Z",
    dataProvider: "fixture",
    device,
    difficulty:
      unknownDifficulty || knownZeroDifficulty ? 0 : location.id === "location_us" ? 20 : 40,
    difficultyKnown: !unknownDifficulty,
    engine: "Google",
    hasRankData: true,
    id: `kw_${index}`,
    impressions: index % 3 === 0 ? null : index * 10,
    intent: index % 2 ? "commercial" : "informational",
    internalId: `keyword_${index}`,
    keyword,
    lastCheckAt: `2026-09-${String((index % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastCheckErrorCode: null,
    lastCheckStatus: "completed" as const,
    latestAttemptHealth: "ok" as const,
    location,
    locationName: `${location.displayName} / ${location.hl}`,
    marketStatus,
    position,
    positionBaseline: baseline,
    positionHistory: [],
    positionHistoryBoundaryAt: null,
    previousPosition: baseline,
    publicId: `kw_${index}`,
    rankingPages: 1,
    rankingPath: null,
    rankingUrl: `https://example.com/${index}`,
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: index % 2 ? "daily" : "weekly",
      jitter_minutes: 0,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    serpFeatures: index % 2 ? ["image"] : [],
    sparkline: [baseline, position],
    tags: index % 2 ? ["Core"] : [],
    targetUrl: null,
    topic: index % 2 ? "Product" : "Docs",
    volume: unknownVolume ? 0 : (locations.indexOf(location) + 1) * 1000,
    volumeKnown: !unknownVolume,
  } satisfies GroupedContractTarget;
}

export function groupedContractFixture() {
  const targets: GroupedContractTarget[] = [];
  let index = 1;
  for (const keyword of terms) {
    for (const location of locations) {
      if ((keyword === "Beta" || keyword === "Straße") && location.id === "location_pl") continue;
      for (const device of ["Desktop", "Mobile"]) {
        targets.push(target(keyword, index, location, device));
        index += 1;
      }
    }
  }
  for (const [keyword, locationIndex, device] of variants) {
    const location = locations[locationIndex];
    if (!location) throw new Error("Missing fixture location");
    targets.push(target(keyword, index, location, device));
    index += 1;
  }
  return { locations, targets };
}
