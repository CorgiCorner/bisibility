import { describe, expect, it } from "vitest";
import { serpCountryCatalog, serpCountryForName } from "./country-catalog";
import {
  countryLanguages,
  defaultCountryLanguage,
  suggestedCountryLanguages,
} from "./country-language";

describe("country languages", () => {
  it("keeps the country default first while allowing the full language catalog", () => {
    for (const country of serpCountryCatalog) {
      expect(defaultCountryLanguage(country.countryCode)).toEqual({
        code: country.languageCode,
        label: country.languageLabel,
      });
      expect(countryLanguages(country.countryCode)[0].code).toBe(country.languageCode);
      for (const alias of country.aliases)
        expect(serpCountryForName(alias)?.countryCode).toBe(country.countryCode);
    }
    expect(countryLanguages("ES").map((language) => language.code)).toEqual(
      expect.arrayContaining(["es", "bem", "es-419"]),
    );
    expect(() => countryLanguages("XX")).toThrow("Unsupported country");
  });
  it("separates country suggestions from all permitted languages", () => {
    expect(suggestedCountryLanguages("ES").map((language) => language.code)).toEqual([
      "es",
      "ca",
      "gl",
    ]);
    expect(suggestedCountryLanguages("BE").map((language) => language.code)).toEqual([
      "nl",
      "fr",
      "de",
    ]);
  });
});
