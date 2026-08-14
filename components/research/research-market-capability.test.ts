import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { KeywordResearchRow } from "@/lib/keyword-research/types";
import { describe, expect, it } from "vitest";
import { researchMetricsAvailable, rowsForResearchMarket } from "./research-market-capability";

const unsupportedLocation: LocationFieldValue = {
  canonicalKey: "ES@en",
  cityName: null,
  countryCode: "ES",
  displayName: "Spain - English",
  hl: "en",
  kind: "country",
  languageCode: "en",
  languageLabel: "English",
  regionName: null,
};

const row: KeywordResearchRow = {
  alreadySaved: false,
  alreadyTracked: false,
  competition: 0.45,
  cpcCents: 120,
  difficulty: 31,
  intent: "commercial",
  keyword: "example keyword",
  monthlyTrend: [{ month: 7, searchVolume: 410, year: 2026 }],
  searchVolume: 500,
  source: "idea",
};

describe("research market capability", () => {
  it("uses the exact country-language pair instead of a country fallback", () => {
    expect(researchMetricsAvailable(unsupportedLocation)).toBe(false);
    expect(
      researchMetricsAvailable({
        ...unsupportedLocation,
        canonicalKey: "ES",
        hl: "es",
        languageCode: "es",
        languageLabel: "Spanish",
      }),
    ).toBe(true);
  });

  it("removes the whole keyword-overview package for an unsupported pair", () => {
    expect(rowsForResearchMarket([row], false)).toEqual([
      {
        ...row,
        competition: null,
        cpcCents: null,
        difficulty: null,
        monthlyTrend: [],
        searchVolume: null,
      },
    ]);
    expect(rowsForResearchMarket([row], true)).toEqual([row]);
  });
});
