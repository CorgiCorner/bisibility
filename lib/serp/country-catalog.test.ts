import { describe, expect, it } from "vitest";
import { serpCountryByCode, serpCountryCatalog, serpCountryForName } from "./country-catalog";

describe("country catalog lookups", () => {
  it("resolves ISO codes in any case and refuses unknown ones", () => {
    expect(serpCountryByCode("es")?.displayName).toBe("Spain");
    expect(serpCountryByCode(" US ")?.languageLabel).toBe("English");
    expect(serpCountryByCode("ZZ")).toBeNull();
  });

  it("resolves names, aliases and codes while ignoring case, diacritics and punctuation", () => {
    expect(serpCountryForName("United States")?.countryCode).toBe("US");
    expect(serpCountryForName("usa")?.countryCode).toBe("US");
    expect(serpCountryForName("España")?.countryCode).toBe("ES");
    expect(serpCountryForName("U.A.E.")?.countryCode).toBe("AE");
    expect(serpCountryForName("gb")?.countryCode).toBe("GB");
    expect(serpCountryForName("Atlantis")).toBeNull();
    expect(serpCountryForName("   ")).toBeNull();
  });

  it("exposes the generated table unchanged", () => {
    expect(serpCountryCatalog.some((entry) => entry.countryCode === "ES")).toBe(true);
  });

  it("includes the shared country support beyond the frozen legacy set", () => {
    expect(serpCountryCatalog).toHaveLength(209);
    expect(
      ["CZ", "SK", "HU", "RO", "UA", "GR", "KR", "ID", "AR"].map(
        (countryCode) => serpCountryByCode(countryCode)?.displayName,
      ),
    ).toEqual([
      "Czechia",
      "Slovakia",
      "Hungary",
      "Romania",
      "Ukraine",
      "Greece",
      "South Korea",
      "Indonesia",
      "Argentina",
    ]);
    expect(["BQ", "CW", "MF", "SX"].map((countryCode) => serpCountryByCode(countryCode))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
