import { researchScopeKey } from "@/lib/research/scope";
import {
  countryScopes,
  researchCountryScopes,
  researchScopeForCountry,
  resolveCountryScope,
} from "@/lib/research/scope-country";
import { describe, expect, it } from "vitest";

describe("researchScopeForCountry", () => {
  it("uses the country's default language when research supports it", () => {
    expect(researchScopeForCountry("US")).toMatchObject({
      countryCode: "US",
      countryName: "United States",
      languageCode: "en",
      researchAvailable: true,
    });
  });

  it("normalizes the code and answers for a lower-case input", () => {
    expect(researchScopeForCountry("de")).toMatchObject({ countryCode: "DE", languageCode: "de" });
  });

  it("returns null for a country outside the catalog", () => {
    expect(researchScopeForCountry("ZZ")).toBeNull();
  });
});

describe("researchCountryScopes", () => {
  it("lists researchable countries once each, alphabetically", () => {
    const scopes = researchCountryScopes();
    const codes = scopes.map((scope) => scope.countryCode);

    expect(new Set(codes).size).toBe(codes.length);
    expect(scopes.every((scope) => scope.researchAvailable)).toBe(true);
    expect([...scopes].sort((a, b) => a.countryName.localeCompare(b.countryName, "en"))).toEqual(
      scopes,
    );
    expect(codes).toContain("US");
  });

  it("returns the same computed catalog on repeat calls", () => {
    expect(researchCountryScopes()).toBe(researchCountryScopes());
  });
});

describe("countryScopes", () => {
  it("keeps one scope per country, the first given, sorted by country name", () => {
    const spanish = researchScopeForCountry("ES");
    const german = researchScopeForCountry("DE");
    if (!spanish || !german) throw new Error("catalog is missing a fixture country");
    const catalan = { ...spanish, languageCode: "ca", languageLabel: "Catalan" };

    const result = countryScopes([spanish, catalan, german]);

    expect(result.map((scope) => scope.countryName)).toEqual(["Germany", "Spain"]);
    expect(result[1]?.languageCode).toBe(spanish.languageCode);
  });
});

describe("resolveCountryScope", () => {
  it("prefers a tracked scope so the project's own language survives the switch", () => {
    const spanish = researchScopeForCountry("ES");
    if (!spanish) throw new Error("catalog is missing a fixture country");
    const catalan = { ...spanish, languageCode: "ca", languageLabel: "Catalan" };

    expect(resolveCountryScope("ES", [catalan])).toBe(catalan);
  });

  it("falls back to the catalog scope for a country the project does not track", () => {
    const resolved = resolveCountryScope("de", []);

    expect(resolved && researchScopeKey(resolved)).toBe("DE:de");
  });
});
