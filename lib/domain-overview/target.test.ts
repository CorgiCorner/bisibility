import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { serpMarkets } from "@/lib/serp/markets";
import { describe, expect, it } from "vitest";
import {
  domainOverviewLocationCode,
  domainOverviewPageLimit,
  normalizeDomainOverviewAnalysis,
  normalizeDomainOverviewMarket,
  normalizeDomainOverviewTarget,
  UnsupportedDomainOverviewTargetError,
} from "./target";

describe("domain overview target", () => {
  it("supplies DataForSEO Labs country handles when the shared location row uses a name", () => {
    expect(
      domainOverviewLocationCode({ countryCode: "US", kind: "country", primaryGeoCode: null }),
    ).toBe(2840);
    expect(
      domainOverviewLocationCode({ countryCode: "PL", kind: "country", primaryGeoCode: null }),
    ).toBe(2616);
    expect(
      domainOverviewLocationCode({
        countryCode: "US",
        kind: "city",
        primaryGeoCode: 1_026_201,
      }),
    ).toBe(1_026_201);
    expect(
      domainOverviewLocationCode({ countryCode: "US", kind: "city", primaryGeoCode: null }),
    ).toBeNull();
  });

  it("has a Labs country handle for every supported SERP market", () => {
    for (const market of serpMarkets) {
      expect(
        domainOverviewLocationCode({
          countryCode: market.google.gl,
          kind: "country",
          primaryGeoCode: null,
        }),
        market.name,
      ).not.toBeNull();
    }
  });

  it("normalizes root domains and strips www", () => {
    expect(normalizeDomainOverviewTarget(" HTTPS://WWW.Example.COM/path ")).toEqual({
      scope: "root",
      target: "example.com",
    });
  });

  it("auto-detects a subdomain", () => {
    expect(normalizeDomainOverviewTarget("https://shop.example.com/catalog")).toEqual({
      scope: "subdomain",
      target: "shop.example.com",
    });
  });

  it("uses the public suffix list for multi-label suffixes", () => {
    expect(normalizeDomainOverviewTarget("https://blog.example.co.uk/post")).toEqual({
      scope: "subdomain",
      target: "blog.example.co.uk",
    });
    expect(normalizeDomainOverviewTarget("example.co.uk")).toEqual({
      scope: "root",
      target: "example.co.uk",
    });
  });

  it("honors an explicit root scope override", () => {
    expect(normalizeDomainOverviewTarget("shop.example.com", "root")).toEqual({
      scope: "root",
      target: "example.com",
    });
  });

  it("honors an explicit subdomain scope override", () => {
    expect(normalizeDomainOverviewTarget("shop.example.com", "subdomain")).toEqual({
      scope: "subdomain",
      target: "shop.example.com",
    });
  });

  it("rejects a subdomain scope that would duplicate the root provider request", () => {
    expect(() => normalizeDomainOverviewTarget("example.com", "subdomain")).toThrow(
      "A root domain does not have a distinct subdomain scope.",
    );
  });

  it.each(["", "localhost", "127.0.0.1", "http://[invalid/path"])(
    "rejects unsupported target %j",
    (target) => {
      expect(() => normalizeDomainOverviewTarget(target)).toThrow(
        UnsupportedDomainOverviewTargetError,
      );
      expect(() => normalizeDomainOverviewTarget(target)).toThrow(
        "The domain overview target must be a public domain.",
      );
    },
  );

  it("normalizes market and page limits without vendor-specific defaults", () => {
    expect(normalizeDomainOverviewMarket({ languageCode: " EN ", locationCode: 2840 })).toEqual({
      languageCode: "en",
      locationCode: 2840,
    });
    expect(domainOverviewPageLimit(2_000, 1_000)).toBe(1_000);
    expect(
      normalizeDomainOverviewAnalysis({
        keywordLimit: 500,
        languageCode: "EN",
        locationCode: 2840,
        pageLimit: 2_000,
        target: "www.example.com",
      }),
    ).toMatchObject({ keywordLimit: 100, languageCode: "en", pageLimit: 1_000 });
  });

  it("validates an explicit Labs country-language pair but preserves numeric compatibility", () => {
    expect(
      normalizeDomainOverviewMarket({ countryCode: "ES", languageCode: "es", locationCode: 2724 }),
    ).toEqual({ countryCode: "ES", languageCode: "es", locationCode: 2724 });
    expect(() =>
      normalizeDomainOverviewMarket({ countryCode: "ES", languageCode: "en", locationCode: 2724 }),
    ).toThrow(ProviderLookupSignal);
    expect(normalizeDomainOverviewMarket({ languageCode: "en", locationCode: 2724 })).toEqual({
      languageCode: "en",
      locationCode: 2724,
    });
  });
});
