import { describe, expect, it } from "vitest";
import {
  canonicalKey,
  countryCodeForMarketName,
  countrySeed,
  LocationInputError,
  normalizeCanonicalLocationKey,
  parseCanonicalKey,
} from "./location";
import { denormalizedLocationLabel } from "./location-label";

describe("location core", () => {
  it("builds stable canonical keys", () => {
    expect(canonicalKey({ countryCode: "us" })).toBe("US");
    expect(canonicalKey({ countryCode: " US " })).toBe("US");
    expect(canonicalKey({ countryCode: "US", regionCode: "us-tx", cityName: "Austin" })).toBe(
      "US/US-TX/Austin",
    );
    expect(canonicalKey({ countryCode: "US", regionName: "Texas", cityName: "Austin" })).toBe(
      "US/Texas/Austin",
    );
    expect(canonicalKey({ countryCode: "US", regionName: "Minnesota", cityName: "Austin" })).toBe(
      "US/Minnesota/Austin",
    );
    expect(canonicalKey({ countryCode: "US", cityName: "Austin" })).toBe("US/Austin");
    expect(canonicalKey({ countryCode: "US", cityName: "  San   Jose " })).toBe("US/San Jose");
    expect(canonicalKey({ countryCode: "ES", languageCode: "es" })).toBe("ES");
    expect(canonicalKey({ countryCode: "ES", languageCode: "en" })).toBe("ES@en");
    expect(
      canonicalKey({
        countryCode: "ES",
        regionName: "Andalusia",
        cityName: "Malaga",
        languageCode: "en",
      }),
    ).toBe("ES/Andalusia/Malaga@en");
  });

  it("parses canonical keys without breaking existing key shapes", () => {
    expect(parseCanonicalKey("US")).toEqual({ countryCode: "US" });
    expect(parseCanonicalKey("US/Austin")).toEqual({ cityName: "Austin", countryCode: "US" });
    expect(parseCanonicalKey("US/US-TX/Austin")).toEqual({
      cityName: "Austin",
      countryCode: "US",
      regionCode: "US-TX",
    });
    expect(parseCanonicalKey("US/Texas/Austin")).toEqual({
      cityName: "Austin",
      countryCode: "US",
      regionName: "Texas",
    });
    expect(parseCanonicalKey("ES/Andalusia/Malaga@en")).toEqual({
      cityName: "Malaga",
      countryCode: "ES",
      languageCode: "en",
      regionName: "Andalusia",
    });
  });

  it("normalizes the default language alias before lookup", () => {
    expect(normalizeCanonicalLocationKey("ES/Andalusia/Malaga@es")).toEqual({
      canonicalKey: "ES/Andalusia/Malaga",
      selector: {
        cityName: "Malaga",
        countryCode: "ES",
        languageCode: "es",
        regionName: "Andalusia",
      },
    });
    expect(normalizeCanonicalLocationKey("ES/Andalusia/Malaga@en").canonicalKey).toBe(
      "ES/Andalusia/Malaga@en",
    );
  });

  it.each(["ES@zz", "ES@en@fr", "ES@"])(
    "rejects an invalid language qualifier before lookup: %s",
    (value) => {
      expect(() => normalizeCanonicalLocationKey(value)).toThrow(LocationInputError);
      try {
        normalizeCanonicalLocationKey(value);
      } catch (error) {
        expect(error).toMatchObject({ field: "languageCode" });
      }
    },
  );
  it("accepts extended provider language codes from the hard catalog", () => {
    expect(normalizeCanonicalLocationKey("ES@es-419").canonicalKey).toBe("ES@es-419");
  });

  it("suffixes only new non-default language labels", () => {
    const base = {
      countryCode: "ES",
      displayName: "Malaga, Andalusia, Spain",
      languageLabel: "Spanish",
    };
    expect(denormalizedLocationLabel({ ...base, languageCode: "es" })).toBe(
      "Malaga, Andalusia, Spain",
    );
    expect(
      denormalizedLocationLabel({ ...base, languageCode: "en", languageLabel: "English" }),
    ).toBe("Malaga, Andalusia, Spain (English)");
  });

  it("seeds supported countries offline and rejects unknown ones", () => {
    expect(countrySeed("us")).toMatchObject({
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
    });
    expect(countrySeed("PL")).toMatchObject({ countryCode: "PL", gl: "pl" });
    expect(countrySeed("ZZ")).toBeNull();
  });

  it("maps legacy market names and aliases to ISO codes", () => {
    expect(countryCodeForMarketName("United States")).toBe("US");
    expect(countryCodeForMarketName("usa")).toBe("US");
    expect(countryCodeForMarketName("Poland")).toBe("PL");
    expect(countryCodeForMarketName("Atlantis")).toBeNull();
  });
});
