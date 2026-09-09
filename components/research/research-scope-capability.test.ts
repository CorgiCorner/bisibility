import type { KeywordResearchRow } from "@/lib/keyword-research/types";
import type { ResearchScope } from "@/lib/research/scope";
import { describe, expect, it } from "vitest";
import { researchScopeMetricsAvailable, rowsForResearchScope } from "./research-scope-capability";

const unsupportedScope: ResearchScope = {
  countryCode: "ES",
  countryName: "Spain",
  languageCode: "en",
  languageLabel: "English",
  providerLocationCode: 2724,
  researchAvailable: false,
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

describe("research scope capability", () => {
  it("uses the exact country-language pair", () => {
    expect(researchScopeMetricsAvailable(unsupportedScope)).toBe(false);
    expect(researchScopeMetricsAvailable({ ...unsupportedScope, researchAvailable: true })).toBe(
      true,
    );
  });

  it("removes the whole keyword-overview package for an unsupported pair", () => {
    expect(rowsForResearchScope([row], false)).toEqual([
      {
        ...row,
        competition: null,
        cpcCents: null,
        difficulty: null,
        monthlyTrend: [],
        searchVolume: null,
      },
    ]);
    expect(rowsForResearchScope([row], true)).toEqual([row]);
  });
});
