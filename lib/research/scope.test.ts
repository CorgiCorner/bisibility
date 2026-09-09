import { researchCountryLocationCode, supportsResearchScope } from "@/lib/serp/research-capability";
import { describe, expect, it } from "vitest";
import {
  researchScopeForLocation,
  researchScopeKey,
  researchScopeOptionsForProject,
} from "./scope";

const spainSpanish = {
  cityName: null,
  countryCode: "ES",
  displayName: "Spain",
  kind: "country" as const,
  languageCode: "es",
  languageLabel: "Spanish",
};

const malagaSpanish = {
  cityName: "Malaga",
  countryCode: "ES",
  displayName: "Malaga, Andalusia, Spain",
  kind: "city" as const,
  languageCode: "es",
  languageLabel: "Spanish",
};

describe("research scopes", () => {
  it("collapses city and country locations with the same country and language", () => {
    expect(researchScopeOptionsForProject([malagaSpanish, spainSpanish])).toEqual([
      {
        countryCode: "ES",
        countryName: "Spain",
        languageCode: "es",
        languageLabel: "Spanish",
        providerLocationCode: 2724,
        researchAvailable: true,
      },
    ]);
  });

  it("keeps different languages for the same country as separate scopes", () => {
    const scopes = researchScopeOptionsForProject([
      spainSpanish,
      {
        ...spainSpanish,
        languageCode: "en",
        languageLabel: "English",
      },
    ]);

    expect(scopes).toHaveLength(2);
    expect(scopes.map((scope) => researchScopeKey(scope))).toEqual(["ES:es", "ES:en"]);
  });

  it("marks a country-language pair outside the research catalog unavailable", () => {
    expect(
      researchScopeForLocation({
        ...spainSpanish,
        languageCode: "en",
        languageLabel: "English",
      }),
    ).toMatchObject({ providerLocationCode: 2724, researchAvailable: false });
  });

  it("keeps generated Labs codes and availability consistent for expanded countries", () => {
    const czech = researchScopeForLocation({
      countryCode: "CZ",
      languageCode: "cs",
      languageLabel: "Czech",
    });
    const iceland = researchScopeForLocation({
      countryCode: "IS",
      languageCode: "is",
      languageLabel: "Icelandic",
    });

    expect(czech).toMatchObject({ providerLocationCode: 2203, researchAvailable: true });
    expect(iceland).toMatchObject({ providerLocationCode: null, researchAvailable: false });
    expect(czech.researchAvailable).toBe(supportsResearchScope("CZ", "cs"));
    expect(iceland.researchAvailable).toBe(supportsResearchScope("IS", "is"));
    expect(researchCountryLocationCode("CZ")).toBe(2203);
    expect(researchCountryLocationCode("IS")).toBeNull();
  });

  it("builds a stable cache key without city identity", () => {
    const cityScope = researchScopeForLocation(malagaSpanish);
    const countryScope = researchScopeForLocation(spainSpanish);

    expect(researchScopeKey(cityScope)).toBe(researchScopeKey(countryScope));
    expect(researchScopeKey(cityScope)).toBe("ES:es");
    expect(researchScopeKey(cityScope)).not.toContain("Malaga");
  });
});
