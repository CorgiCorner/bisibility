import { domainOverviewUnavailableMessage } from "@/lib/domain-overview/scope-options";
import { describe, expect, it } from "vitest";

describe("DomainOverviewAnalyzeCard scope copy", () => {
  it("names the unsupported country-language pair and preserves rank tracking", () => {
    expect(
      domainOverviewUnavailableMessage({
        countryCode: "ES",
        countryName: "Spain",
        languageCode: "eu",
        languageLabel: "Basque",
        providerLocationCode: 2724,
        researchAvailable: false,
      }),
    ).toBe("Research is not available for Spain / Basque. Rank tracking is unaffected.");
  });
});
