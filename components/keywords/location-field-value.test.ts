import { describe, expect, it } from "vitest";
import { locationFieldValueFromKeywordLocation } from "./location-field-value";

function location(kind: "country" | "region" | "city", canonicalKey: string) {
  return {
    canonicalKey,
    kind,
    cityName: null,
    countryCode: "ES",
    displayName: "Andalusia",
    gl: "es",
    hl: "en",
    id: "loc",
    languageLabel: "English",
  };
}

describe("stored location to field value", () => {
  it("keeps a region and its language instead of downgrading it to the country", () => {
    expect(
      locationFieldValueFromKeywordLocation(location("region", "ES/Andalusia@en")),
    ).toMatchObject({
      canonicalKey: "ES/Andalusia@en",
      kind: "region",
      regionName: "Andalusia",
    });
  });

  it("keeps a country's non-default language", () => {
    expect(locationFieldValueFromKeywordLocation(location("country", "ES@en"))).toMatchObject({
      canonicalKey: "ES@en",
      kind: "country",
    });
  });
});
