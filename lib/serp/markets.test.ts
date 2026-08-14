import { describe, expect, it } from "vitest";
import {
  googleSerpLocale,
  isSupportedSerpLanguageCode,
  languageForSerpMarket,
  normalizeSerpMarketName,
  resolveEffectiveSerpDepth,
  resolveSerpDepth,
  resolveSerpMarket,
  resolveSerpStopOnMatch,
  serpMarketLanguages,
  serpMarketLocationValues,
  serpMarketNames,
  serpMarkets,
  suggestedSerpMarketLanguages,
} from "./markets";

function aliasKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

describe("SERP market model", () => {
  it("normalizes common country aliases to canonical app names", () => {
    expect(normalizeSerpMarketName("US")).toBe("United States");
    expect(normalizeSerpMarketName("uk")).toBe("United Kingdom");
    expect(normalizeSerpMarketName("Polska")).toBe("Poland");
  });

  it("expands canonical markets to stored legacy aliases", () => {
    expect(serpMarketLocationValues("United States")).toEqual([
      "United States",
      "US",
      "USA",
      "United States of America",
    ]);
    expect(serpMarketLocationValues("DE")).toEqual(["Germany", "DE", "Deutschland"]);
    expect(serpMarketLocationValues("Global")).toEqual(["Global"]);
  });

  it("keeps canonical markets provider-neutral", () => {
    const market = resolveSerpMarket("Germany") as Record<string, unknown>;

    expect(market).toMatchObject({
      aliases: ["DE", "Deutschland"],
      google: { gl: "de" },
      language: { code: "de", label: "German" },
      name: "Germany",
    });
    expect(market.dataForSeo).toBeUndefined();
    expect(market.serpApi).toBeUndefined();
  });

  it("keeps the market data exhaustive and alias keys collision-free", () => {
    expect(serpMarkets).toHaveLength(27);
    expect(serpMarkets.map((market) => market.name)).toEqual([...serpMarketNames]);

    const aliases = new Map<string, string>();
    for (const market of serpMarkets) {
      for (const alias of [market.name, ...market.aliases]) {
        const key = aliasKey(alias);
        const existing = aliases.get(key);
        expect(existing === undefined || existing === market.name).toBe(true);
        aliases.set(key, market.name);
      }
    }
  });

  it.each([...serpMarkets])("validates every market entry: $name", (market) => {
    // Canonical name and every alias round-trip through the production index.
    expect(normalizeSerpMarketName(market.name)).toBe(market.name);
    for (const alias of market.aliases) {
      expect(normalizeSerpMarketName(alias)).toBe(market.name);
    }
    // gl is a 2-letter lowercase code; language code/label are populated.
    expect(market.google.gl).toMatch(/^[a-z]{2}$/);
    expect(market.language.code.trim().length).toBeGreaterThan(0);
    expect(market.language.label.trim().length).toBeGreaterThan(0);
    expect(market.languages[0]).toEqual(market.language);
    // Resolvers stay consistent with the table for every entry.
    expect(resolveSerpMarket(market.name)).toEqual(market);
    expect(googleSerpLocale(market.name)).toEqual({
      code: market.google.gl.toUpperCase(),
      gl: market.google.gl,
      hl: market.language.code,
    });
  });

  it("preserves every existing market default and orders it first", () => {
    const legacyDefaults = {
      Australia: "en",
      Austria: "de",
      Belgium: "nl",
      Brazil: "pt",
      Canada: "en",
      Denmark: "da",
      Finland: "fi",
      France: "fr",
      Germany: "de",
      India: "en",
      Ireland: "en",
      Italy: "it",
      Japan: "ja",
      Mexico: "es",
      Netherlands: "nl",
      "New Zealand": "en",
      Norway: "no",
      Poland: "pl",
      Portugal: "pt",
      Singapore: "en",
      "South Africa": "en",
      Spain: "es",
      Sweden: "sv",
      Switzerland: "de",
      "United Arab Emirates": "en",
      "United Kingdom": "en",
      "United States": "en",
    };

    for (const market of serpMarkets) {
      expect(market.language.code).toBe(legacyDefaults[market.name]);
      expect(market.languages[0]).toEqual(market.language);
    }
  });

  it("uses the global hard catalog while keeping CLDR suggestions country scoped", () => {
    const spanishLanguages = serpMarketLanguages("Spain");
    expect(spanishLanguages.map((language) => language.code).slice(0, 3)).toEqual([
      "es",
      "ach",
      "af",
    ]);
    expect(spanishLanguages.map((language) => language.code)).toEqual(
      expect.arrayContaining(["bem", "es-419"]),
    );
    expect(suggestedSerpMarketLanguages("Spain").map((language) => language.code)).toEqual([
      "es",
      "ca",
      "gl",
    ]);
    expect(suggestedSerpMarketLanguages("Belgium").map((language) => language.code)).toEqual([
      "nl",
      "fr",
      "de",
    ]);
  });

  it("validates all hard-catalog language codes without making them suggestions", () => {
    expect(isSupportedSerpLanguageCode("bem")).toBe(true);
    expect(isSupportedSerpLanguageCode("es-419")).toBe(true);
    expect(isSupportedSerpLanguageCode("zz")).toBe(false);
    expect(suggestedSerpMarketLanguages("Spain").map((language) => language.code)).not.toContain(
      "bem",
    );
  });

  it("rejects unsupported result depths", () => {
    expect(resolveSerpDepth(undefined)).toBe(100);
    expect(resolveSerpDepth(10)).toBe(10);
    expect(resolveSerpDepth(20)).toBe(20);
    expect(() => resolveSerpDepth(15)).toThrow("Unsupported SERP depth");
  });

  it("resolves effective depth from request, schedule, project, then default", () => {
    expect(
      resolveEffectiveSerpDepth({
        projectDepth: 100,
        requestedDepth: 20,
        scheduleDepth: 50,
      }),
    ).toBe(20);
    expect(resolveEffectiveSerpDepth({ projectDepth: 100, scheduleDepth: 50 })).toBe(50);
    expect(resolveEffectiveSerpDepth({ projectDepth: 100 })).toBe(100);
    expect(resolveEffectiveSerpDepth({})).toBe(100);
  });

  it("defaults SERP stop-on-match behavior in one resolver", () => {
    expect(resolveSerpStopOnMatch(undefined)).toBe(true);
    expect(resolveSerpStopOnMatch(null)).toBe(true);
    expect(resolveSerpStopOnMatch(false)).toBe(false);
  });

  it("resolves display language and live SERP locale from the same market", () => {
    expect(languageForSerpMarket("France")).toBe("French");
    expect(googleSerpLocale("United Kingdom")).toEqual({ code: "GB", gl: "gb", hl: "en" });
  });
});
