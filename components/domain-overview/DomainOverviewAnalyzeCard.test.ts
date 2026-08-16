import { toMarketOption } from "@/components/domain-overview/DomainOverviewAnalyzeCard";
import {
  DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP,
  type DomainOverviewMarketOption,
} from "@/lib/domain-overview/market-options";
import { describe, expect, it } from "vitest";

function market(overrides: Partial<DomainOverviewMarketOption> = {}): DomainOverviewMarketOption {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    kind: "country",
    languageCode: "en",
    languageLabel: "English",
    locationCode: 2840,
    provenance: null,
    regionName: null,
    researchAvailable: true,
    ...overrides,
  };
}

describe("toMarketOption", () => {
  it("preserves the full DomainOverviewMarketOption as the callback payload", () => {
    const source = market();
    const option = toMarketOption(source);
    expect(option.payload).toBe(source);
    expect(option).toMatchObject({
      countryCode: "US",
      languageCode: "en",
      languageLabel: "English",
      locationLabel: "United States",
      value: "US",
    });
  });

  it("marks unavailable options disabled with the exact tooltip and secondary text", () => {
    const source = market({
      canonicalKey: "ES@en",
      countryCode: "ES",
      displayName: "Spain",
      languageCode: "en",
      languageLabel: "English",
      researchAvailable: false,
    });
    const option = toMarketOption(source);
    expect(option.disabled).toBe(true);
    expect(option.secondary).toBe("unavailable");
    expect(option.tooltip).toBe(DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP);
  });

  it("uses provenance as the tooltip for available options", () => {
    const source = market({
      provenance: "Malaga tracked at city level - domain analysis runs on the country pair.",
    });
    const option = toMarketOption(source);
    expect(option.disabled).toBe(false);
    expect(option.tooltip).toBe(
      "Malaga tracked at city level - domain analysis runs on the country pair.",
    );
  });

  it("omits tooltip when no provenance and research is available", () => {
    const option = toMarketOption(market());
    expect(option.disabled).toBe(false);
    expect(option.tooltip).toBeUndefined();
  });
});
