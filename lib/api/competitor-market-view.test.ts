import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
} from "@/lib/competitors/competitor-market-model";
import { expect, it } from "vitest";
import { competitorMarketApiView } from "./competitor-market-view";

it("uses precisely the same null/ratio/quality result as the UI model", () => {
  const data = {
    allColumns: [{ domain: "mine.test", kind: "You" as const, label: "Mine" }],
    competitorCount: 0,
    device: "desktop" as const,
    engine: "google" as const,
    key: "market",
    languageLabel: "English",
    location: "US",
    locationId: "us",
    locationKind: "country" as const,
    observations: [
      {
        id: "kw",
        keyword: "test",
        completed: true,
        ranked: true,
        ranks: { "mine.test": 1 },
        tags: [],
        volume: 0,
        quality: {
          "mine.test": { evidence: "positive" as const, freshness: "fresh" as const, reason: null },
        },
      },
    ],
    tags: [],
    trackedKeywordCount: 1,
  };
  const market = buildCompetitorMarket(data, emptyCompetitorFilter),
    api = competitorMarketApiView(market);
  expect(api.shares[0].shareOfVoice).toBeNull();
  expect(api.quality).toEqual(market.quality);
  const weighted = buildCompetitorMarket(
    { ...data, observations: [{ ...data.observations[0], volume: null }] },
    emptyCompetitorFilter,
  );
  expect(competitorMarketApiView(weighted).shares[0].shareOfVoice).toBe(
    weighted.shares[0].shareOfVoice! / 100,
  );
});
