import { describe, expect, it } from "vitest";
import {
  countryDegradedResearchLocation,
  researchCountryLocationCode,
  researchProviderLanguageCode,
  researchProviderLocation,
  researchProviderRankLocation,
  supportsResearchMarket,
} from "./market-capability";

describe("research market capability", () => {
  it("uses the generated country-language catalog", () => {
    expect(supportsResearchMarket("ES", "es")).toBe(true);
    expect(supportsResearchMarket("ES", "en")).toBe(false);
    expect(supportsResearchMarket("BE", "fr")).toBe(true);
    expect(supportsResearchMarket("NO", "no")).toBe(true);
    expect(researchProviderLanguageCode("NO", "no")).toBe("nb");
    expect(researchProviderLanguageCode("ES", "es")).toBe("es");
  });

  it("translates the Norwegian app language at the Labs provider boundary", () => {
    expect(
      researchProviderRankLocation({
        gl: "no",
        hl: "no",
        primaryGeoCode: null,
        primaryGeoName: "Norway",
        secondaryGeoName: "Norway",
      }),
    ).toMatchObject({ gl: "no", hl: "nb" });
    expect(
      researchProviderLocation({ countryCode: "NO", languageCode: "no", locationCode: 2578 }),
    ).toMatchObject({ gl: "no", hl: "nb" });
  });

  it("preserves language while degrading a city to its country", () => {
    expect(
      countryDegradedResearchLocation({
        gl: "es",
        hl: "ca",
        primaryGeoCode: 12_345,
        primaryGeoName: "Barcelona, Spain",
        secondaryGeoName: "Barcelona, Catalonia, Spain",
      }),
    ).toEqual({
      gl: "es",
      hl: "ca",
      primaryGeoCode: null,
      primaryGeoName: "Spain",
      secondaryGeoName: "Spain",
    });
  });

  it("carries explicit ISO into the direct numeric provider location", () => {
    expect(
      researchProviderLocation({ countryCode: "PL", languageCode: "pl", locationCode: 2616 }),
    ).toEqual({
      gl: "pl",
      hl: "pl",
      primaryGeoCode: 2616,
      primaryGeoName: "",
      secondaryGeoName: "",
    });
  });

  it("owns the country-to-Labs numeric translation used by research consumers", () => {
    expect(researchCountryLocationCode("es")).toBe(2724);
    expect(researchCountryLocationCode("XX")).toBeNull();
  });
});
