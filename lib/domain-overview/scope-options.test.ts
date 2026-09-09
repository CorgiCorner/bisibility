import { describe, expect, it } from "vitest";
import { domainOverviewCatalogScopes, domainOverviewTrackedScopes } from "./scope-options";

describe("domain overview scope options", () => {
  it("deduplicates tracked country-language pairs into ResearchScope values", () => {
    const scopes = domainOverviewTrackedScopes([
      { countryCode: "ES", languageCode: "es", languageLabel: "Spanish" },
      { countryCode: "ES", languageCode: "es", languageLabel: "Spanish" },
      { countryCode: "ES", languageCode: "en", languageLabel: "English" },
    ]);

    expect(scopes).toEqual([
      expect.objectContaining({
        countryCode: "ES",
        countryName: "Spain",
        languageCode: "es",
        languageLabel: "Spanish",
        providerLocationCode: 2724,
        researchAvailable: true,
      }),
      expect.objectContaining({
        countryCode: "ES",
        countryName: "Spain",
        languageCode: "en",
        languageLabel: "English",
        providerLocationCode: 2724,
        researchAvailable: false,
      }),
    ]);
  });

  it("excludes unsupported country-language pairs from the picker", () => {
    expect(domainOverviewCatalogScopes()).not.toContainEqual(
      expect.objectContaining({
        countryCode: "ES",
        languageCode: "en",
        researchAvailable: false,
      }),
    );
  });
});
