import { LocationInputError } from "@/lib/serp/location";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCATION_KEY,
  deprecatedLegacyMarketField,
  LEGACY_DEFAULT_MARKET_NAME,
  LEGACY_MARKET_INPUT_DEPRECATED_SINCE,
  LEGACY_MARKET_INPUT_SUNSET_VERSION,
  legacyMarketDeprecationNote,
  legacyMarketFilterValues,
  legacyMarketLocationKey,
  legacyMarketLocationSelection,
  legacyMarketNameOpenApiSchema,
  legacyMarketNameSchema,
  legacyMarketNameValueSchema,
  legacySerpMarketCatalog,
} from "./legacy-market-input";

function minorDistance(from: string, to: string) {
  const [fromMajor, fromMinor] = from.split(".").map(Number);
  const [toMajor, toMinor] = to.split(".").map(Number);
  return toMajor === fromMajor ? toMinor - fromMinor : Number.POSITIVE_INFINITY;
}

describe("legacy market input translator", () => {
  it("translates legacy market names, cities, and languages into canonical location keys", () => {
    expect(legacyMarketLocationKey({ country: "United States" })).toBe("US");
    expect(legacyMarketLocationKey({ country: "usa" })).toBe("US");
    expect(legacyMarketLocationKey({ city: " Austin ", country: "US" })).toBe("US/Austin");
    expect(legacyMarketLocationKey({ country: "Spain", language: "en" })).toBe("ES@en");
    expect(legacyMarketLocationKey({ country: "Spain", language: "es" })).toBe("ES");
    expect(legacyMarketLocationKey({ city: "Malaga", country: "Spain", language: "EN" })).toBe(
      "ES/Malaga@en",
    );
    expect(legacyMarketLocationKey({ city: "", country: "Germany" })).toBe("DE");
    expect(legacyMarketLocationKey({ city: null, country: "Germany", language: null })).toBe("DE");
    // Key separators inside a city collapse to spaces so the legacy city still resolves.
    expect(legacyMarketLocationKey({ city: "San/Jose@home", country: "US" })).toBe(
      "US/San Jose home",
    );
  });

  it("rejects names and languages outside the catalog with correctable input errors", () => {
    expect(() => legacyMarketLocationKey({ country: "Mars" })).toThrow(LocationInputError);
    expect(() => legacyMarketLocationKey({ country: "Mars" })).toThrow("Unsupported country: Mars");
    expect(() => legacyMarketLocationKey({ country: "Spain", language: "xx" })).toThrow(
      "Unsupported language: xx",
    );
  });

  it("keeps legacy cities structured for provider resolution", () => {
    expect(legacyMarketLocationSelection({ city: " Austin ", country: "usa" })).toEqual({
      cityName: "Austin",
      countryCode: "US",
      kind: "city",
    });
    expect(legacyMarketLocationSelection({ country: "Spain", language: "en" })).toEqual({
      canonicalKey: "ES@en",
      kind: "city",
    });
  });

  it("keeps the legacy schema, defaults, and filter aliases wire-compatible", () => {
    expect(legacyMarketNameSchema.parse("gb")).toBe("United Kingdom");
    expect(() => legacyMarketNameSchema.parse("Global")).toThrow(
      "Choose a supported SERP country.",
    );
    expect(LEGACY_DEFAULT_MARKET_NAME).toBe("United States");
    expect(DEFAULT_LOCATION_KEY).toBe("US");
    expect(legacyMarketFilterValues("usa")).toEqual([
      "United States",
      "US",
      "USA",
      "United States of America",
      "usa",
    ]);
    expect(legacyMarketFilterValues("Atlantis")).toEqual(["Atlantis"]);
  });

  it("documents deprecated fields with a sunset at least two minor releases away", () => {
    expect(
      minorDistance(LEGACY_MARKET_INPUT_DEPRECATED_SINCE, LEGACY_MARKET_INPUT_SUNSET_VERSION),
    ).toBeGreaterThanOrEqual(2);
    expect(legacyMarketDeprecationNote()).toContain("location_key");
    expect(legacyMarketDeprecationNote()).toContain(LEGACY_MARKET_INPUT_SUNSET_VERSION);

    const schema = legacyMarketNameOpenApiSchema("Legacy country market name.");
    expect(schema).toMatchObject({ deprecated: true, example: "United States", type: "string" });
    expect(schema.enum).toEqual(expect.arrayContaining(["United States", "Germany", "Poland"]));
    expect(schema.description).toBe(`Legacy country market name. ${legacyMarketDeprecationNote()}`);
    expect(deprecatedLegacyMarketField("City.", { type: ["string", "null"] })).toEqual({
      deprecated: true,
      description: `City. ${legacyMarketDeprecationNote()}`,
      type: ["string", "null"],
    });
    expect(legacyMarketNameValueSchema("Exported name.")).toEqual({
      description: "Exported name.",
      enum: schema.enum,
      example: "United States",
      type: "string",
    });
  });

  it("lists the legacy catalog with the location key each name maps to", () => {
    const catalog = legacySerpMarketCatalog();
    expect(catalog.default_market).toBe("United States");
    expect(catalog.markets[0]).toEqual({
      gl: "us",
      language_code: "en",
      language_label: "English",
      location_key: "US",
      name: "United States",
    });
    expect(catalog.markets).toHaveLength(27);
    expect(new Set(catalog.markets.map((market) => market.location_key)).size).toBe(27);
  });
});
