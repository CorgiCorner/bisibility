import { describe, expect, it } from "vitest";
import {
  defaultSerpKeywordMarket,
  projectDefaultSerpMarket,
  serpMarketUpdatePlan,
} from "./default-market";

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

  it("moves only non-conflicting keywords from the current default market", () => {
    expect(
      serpMarketUpdatePlan(
        [
          { device: "desktop", id: "kw_1", location: "United States", text: "rank tracker" },
          { device: "desktop", id: "kw_2", location: "US", text: "seo tool" },
          { device: "mobile", id: "kw_3", location: "Germany", text: "rank tracker" },
        ],
        { country: "Germany", device: "mobile" },
      ),
    ).toEqual({
      before: { country: "United States", device: "desktop" },
      skipped: 1,
      updateIds: ["kw_2"],
    });
  });

  it("moves city default markets by canonical location key with text conflicts", () => {
    const austin = {
      canonicalKey: "US/Texas/Austin",
      cityName: "Austin",
      countryCode: "US",
      displayName: "Austin, Texas, United States",
      kind: "city" as const,
    };
    const dallas = {
      canonicalKey: "US/Texas/Dallas",
      cityName: "Dallas",
      countryCode: "US",
      displayName: "Dallas, Texas, United States",
      kind: "city" as const,
    };
    const keywords = [
      {
        device: "desktop" as const,
        id: "kw_1",
        location: "Austin, Texas, United States",
        locationRef: austin,
        text: "rank tracker",
      },
      {
        device: "desktop" as const,
        id: "kw_2",
        location: "Austin, Texas, United States",
        locationRef: austin,
        text: "seo tool",
      },
      {
        device: "mobile" as const,
        id: "kw_3",
        location: "Dallas, Texas, United States",
        locationRef: dallas,
        text: "rank tracker",
      },
    ];
    const next = {
      country: "United States",
      device: "mobile" as const,
      displayName: "Dallas, Texas, United States",
      locationKey: "US/Texas/Dallas",
    };

    expect(serpMarketUpdatePlan(keywords, next)).toEqual({
      before: { country: "United States", device: "desktop" },
      skipped: 1,
      updateIds: ["kw_2"],
    });
  });

  it("returns a no-op update plan when the default keyword market is unchanged", () => {
    expect(
      serpMarketUpdatePlan(
        [
          { device: "desktop", id: "kw_1", location: "United States", text: "rank tracker" },
          { device: "desktop", id: "kw_2", location: "US", text: "seo tool" },
        ],
        { country: "United States", device: "desktop" },
      ),
    ).toEqual({
      before: { country: "United States", device: "desktop" },
      skipped: 0,
      updateIds: [],
    });
  });
});
