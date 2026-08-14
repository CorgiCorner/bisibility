import { describe, expect, it } from "vitest";
import { serpMarkets } from "../markets";
import { cldrMarketLanguageSuggestions } from "./cldr-market-language-suggestions";
import { labsMarketLanguageCatalog } from "./labs-market-language-catalog";
import { serpLanguageCatalog } from "./serp-language-catalog";

describe("generated market language catalogs", () => {
  it("contains every existing market default in the hard language catalog", () => {
    const hardCodes = new Set(serpLanguageCatalog.map((language) => language.code));

    for (const market of serpMarkets) {
      expect(hardCodes).toContain(market.language.code);
    }
    for (const code of ["en", "es", "bem", "es-419", "pt-br", "pt-pt", "sr-me", "zh-cn", "zh-tw"]) {
      expect(hardCodes).toContain(code);
    }
  });

  it("keeps the Labs country-language catalog pair scoped", () => {
    expect(labsMarketLanguageCatalog.US).toContain("en");
    expect(labsMarketLanguageCatalog.ES).toContain("es");
    expect(labsMarketLanguageCatalog.ES).not.toContain("en");
    expect(labsMarketLanguageCatalog.NO).toContain("nb");
  });

  it("uses official CLDR languages above five percent as suggestions", () => {
    expect(cldrMarketLanguageSuggestions.ES).toEqual(["es", "ca", "gl"]);
    expect(cldrMarketLanguageSuggestions.ES).not.toContain("en");
    expect(cldrMarketLanguageSuggestions.BE).toEqual(["nl", "fr", "de"]);
    expect(cldrMarketLanguageSuggestions.BE).not.toContain("en");
  });
});
