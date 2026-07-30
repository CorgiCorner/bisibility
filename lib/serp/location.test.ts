import { describe, expect, it } from "vitest";
import { canonicalKey, countryCodeForMarketName, countrySeed, parseCanonicalKey } from "./location";

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
  });

  it("seeds supported countries offline and rejects unknown ones", () => {
    expect(countrySeed("us")).toMatchObject({
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
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
