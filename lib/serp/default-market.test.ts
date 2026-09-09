import { describe, expect, it } from "vitest";
import { projectDefaultSerpMarket } from "./default-market";

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

  it("ignores denormalized labels when selecting a default", () => {
    expect(
      projectDefaultSerpMarket(null, [{ device: "mobile", location: "Germany" }]),
    ).toMatchObject({
      locationKey: "US",
      source: "fallback",
    });
  });

  it("takes the explicit canonical key over a stale country label", () => {
    expect(
      projectDefaultSerpMarket(
        { country: "United States", device: "mobile", locationKey: "DE@en" },
        [],
      ),
    ).toMatchObject({
      country: "Germany",
      locationKey: "DE@en",
      source: "explicit",
    });
  });

  it("keeps same-named regions and language variants separate", () => {
    const make = (key: string) => ({
      device: "mobile" as const,
      location: "Display label",
      locationRef: {
        canonicalKey: key,
        cityName: null,
        countryCode: "ES",
        displayName: "Andalusia",
        kind: "region" as const,
      },
    });
    expect(
      projectDefaultSerpMarket(null, [
        make("ES/Andalusia"),
        make("ES/Andalusia@en"),
        make("ES/Andalusia@en"),
      ]),
    ).toMatchObject({
      locationKey: "ES/Andalusia@en",
      displayName: "Andalusia",
      source: "derived",
    });
  });
});
