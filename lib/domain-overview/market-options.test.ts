import { describe, expect, it } from "vitest";
import {
  domainOverviewCatalogMarkets,
  domainOverviewTrackedMarkets,
  filterDomainOverviewMarkets,
} from "./market-options";

describe("domain overview market options", () => {
  it("degrades city registry entries to country pairs and deduplicates them", () => {
    const markets = domainOverviewTrackedMarkets([
      {
        cityName: null,
        countryCode: "ES",
        displayName: "Spain",
        kind: "country",
        languageCode: "es",
        languageLabel: "Spanish",
      },
      {
        cityName: "Malaga",
        countryCode: "ES",
        displayName: "Malaga, Andalusia, Spain",
        kind: "city",
        languageCode: "es",
        languageLabel: "Spanish",
      },
      {
        cityName: null,
        countryCode: "ES",
        displayName: "Spain",
        kind: "country",
        languageCode: "en",
        languageLabel: "English",
      },
    ]);

    expect(markets).toHaveLength(2);
    expect(markets[0]).toMatchObject({
      canonicalKey: "ES",
      displayName: "Spain",
      locationCode: 2724,
      provenance: "Malaga tracked at city level - domain analysis runs on the country pair.",
      researchAvailable: true,
    });
    expect(markets[1]).toMatchObject({
      canonicalKey: "ES@en",
      researchAvailable: false,
    });
  });

  it("builds catalog rows only from the shared Labs capability contract", () => {
    const catalog = domainOverviewCatalogMarkets();
    expect(catalog).toContainEqual(
      expect.objectContaining({ canonicalKey: "US", researchAvailable: true }),
    );
    expect(catalog).not.toContainEqual(expect.objectContaining({ canonicalKey: "ES@en" }));
    expect(catalog.every((market) => market.locationCode != null)).toBe(true);
  });

  it("searches country and language labels and codes together", () => {
    const catalog = domainOverviewCatalogMarkets();
    expect(filterDomainOverviewMarkets(catalog, "polish pl")).toContainEqual(
      expect.objectContaining({ canonicalKey: "PL", languageLabel: "Polish" }),
    );
  });
});
