import { countryValueForCode } from "@/components/keywords/location-picker-data";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";
import { serpMarkets } from "@/lib/serp/markets";
import { describe, expect, it } from "vitest";
import {
  additionalMarketLanguages,
  allMarketLanguages,
  defaultMarketLanguage,
  marketChoice,
  recommendedMarketLanguages,
} from "./market-picker-model";

function spain() {
  const location = countryValueForCode("ES");
  if (!location) throw new Error("Spain fixture is missing.");
  return location;
}

describe("market picker model", () => {
  it("sorts the CLDR suggestions alphabetically and keeps them country scoped", () => {
    expect(recommendedMarketLanguages(spain()).map((language) => language.code)).toEqual([
      "ca",
      "gl",
      "es",
    ]);
    expect(defaultMarketLanguage(spain()).code).toBe("es");
    expect(additionalMarketLanguages(spain(), "English").map((language) => language.code)).toEqual([
      "en",
    ]);
  });

  it("splits the committed catalog across the two groups without gaps or repeats", () => {
    const codes = [
      ...recommendedMarketLanguages(spain()),
      ...additionalMarketLanguages(spain(), ""),
    ].map((language) => language.code);

    expect(codes).toHaveLength(serpLanguageCatalog.length);
    expect(new Set(codes).size).toBe(serpLanguageCatalog.length);
  });

  it("covers the catalog in every market, not just the fixture one", () => {
    // The picker resolves a clicked row through the location's full language set. If a
    // suggested row ever fell outside that set it would render, look selected, and then
    // be dropped on commit - so the containment has to hold for every market, not Spain.
    for (const market of serpMarkets) {
      const location = countryValueForCode(market.google.gl.toUpperCase());
      if (!location) throw new Error(`Missing location fixture for ${market.name}.`);
      const all = new Set(allMarketLanguages(location).map((language) => language.code));
      const codes = [
        ...recommendedMarketLanguages(location),
        ...additionalMarketLanguages(location, ""),
      ].map((language) => language.code);

      for (const code of codes) {
        expect(all, `${market.name} offers ${code} outside its language set`).toContain(code);
      }
      expect(codes, market.name).toHaveLength(serpLanguageCatalog.length);
      expect(new Set(codes).size, market.name).toBe(serpLanguageCatalog.length);
    }
  });

  it("sorts the full group alphabetically by label", () => {
    const labels = additionalMarketLanguages(spain(), "").map((language) => language.label);

    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right, "en")));
  });

  it("builds pair identity and research capability from shared contracts", () => {
    expect(marketChoice(spain(), { code: "es", label: "Spanish" })).toMatchObject({
      canonicalKey: "ES",
      researchAvailable: true,
    });
    expect(marketChoice(spain(), { code: "en", label: "English" })).toMatchObject({
      canonicalKey: "ES@en",
      researchAvailable: false,
    });
  });
});
