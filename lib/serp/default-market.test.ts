import { describe, expect, it } from "vitest";
import { defaultSerpKeywordMarket, projectDefaultSerpMarket } from "./default-market";

describe("SERP default market planning", () => {
  it("prefers an explicit project default over derived keyword markets", () => {
    expect(
      projectDefaultSerpMarket(
        {
          city: "Austin, Texas, United States",
          country: "United States",
          device: "mobile",
          locationKey: "US/Texas/Austin",
        },
        [
          { device: "desktop", location: "Germany" },
          { device: "desktop", location: "Germany" },
        ],
      ),
    ).toEqual({
      city: "Austin, Texas, United States",
      country: "United States",
      device: "mobile",
      displayName: "Austin, Texas, United States",
      locationKey: "US/Texas/Austin",
      source: "explicit",
    });
  });

  it("derives the default from existing keyword location identities when unset", () => {
    expect(
      projectDefaultSerpMarket(null, [
        {
          device: "mobile",
          location: "Austin, Texas, United States",
          locationRef: {
            canonicalKey: "US/Texas/Austin",
            cityName: "Austin",
            countryCode: "US",
            displayName: "Austin, Texas, United States",
            kind: "city",
          },
        },
        {
          device: "mobile",
          location: "Austin, Texas, United States",
          locationRef: {
            canonicalKey: "US/Texas/Austin",
            cityName: "Austin",
            countryCode: "US",
            displayName: "Austin, Texas, United States",
            kind: "city",
          },
        },
        { device: "desktop", location: "Germany" },
      ]),
    ).toEqual({
      city: "Austin, Texas, United States",
      country: "United States",
      device: "mobile",
      displayName: "Austin, Texas, United States",
      locationKey: "US/Texas/Austin",
      source: "derived",
    });
  });

  it("falls back to the hardcoded market when no explicit or derived market exists", () => {
    expect(projectDefaultSerpMarket(null, [{ device: "desktop", location: "Global" }])).toEqual({
      city: null,
      country: "United States",
      device: "desktop",
      displayName: "United States",
      locationKey: "US",
      source: "fallback",
    });
  });

  it("uses the dominant supported keyword market", () => {
    expect(
      defaultSerpKeywordMarket([
        { device: "desktop", location: "Global" },
        { device: "mobile", location: "DE" },
        { device: "mobile", location: "Germany" },
      ]),
    ).toMatchObject({ device: "mobile", location: "Germany" });
  });

  it("uses deterministic tie-breaks for equal keyword markets", () => {
    const tied = [
      { device: "mobile" as const, location: "Poland" },
      { device: "desktop" as const, location: "United States" },
      { device: "desktop" as const, location: "Germany" },
    ];

    expect(defaultSerpKeywordMarket(tied)).toMatchObject({
      device: "desktop",
      location: "United States",
    });
    expect(defaultSerpKeywordMarket([...tied].reverse())).toMatchObject({
      device: "desktop",
      location: "United States",
    });
  });
});
