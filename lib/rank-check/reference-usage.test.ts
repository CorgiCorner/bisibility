import { describe, expect, it } from "vitest";
import { aggregateProviderReferenceUsage } from "./reference-usage";

describe("aggregateProviderReferenceUsage", () => {
  it("groups completed usage by the provider that ran each check", () => {
    expect(
      aggregateProviderReferenceUsage([
        { billingUnits: null, checks: 2, provider: "dataforseo", requestedDepth: 10 },
        { billingUnits: null, checks: 1, provider: "dataforseo", requestedDepth: 100 },
        { billingUnits: 4, checks: 3, provider: "serpapi", requestedDepth: 100 },
      ]),
    ).toEqual([
      {
        billableUnits: 12,
        checks: 3,
        provider: "serpapi",
        providerLabel: "SerpAPI",
        rateBasis: "Production plan equivalent",
        referenceCostCents: 12,
        referenceCostKnown: true,
      },
      {
        billableUnits: 3,
        checks: 3,
        provider: "dataforseo",
        providerLabel: "DataForSEO",
        rateBasis: "Live depth pricing",
        referenceCostCents: 1.95,
        referenceCostKnown: true,
      },
    ]);
  });

  it("derives legacy request units from depth and does not accept tenant-entered prices", () => {
    expect(
      aggregateProviderReferenceUsage([
        { billingUnits: null, checks: 2, provider: "serpapi", requestedDepth: 20 },
      ]),
    ).toEqual([expect.objectContaining({ billableUnits: 4, referenceCostCents: 4 })]);
  });

  it("keeps unknown provider usage visible without presenting it as free", () => {
    expect(
      aggregateProviderReferenceUsage([
        { billingUnits: 7, checks: 2, provider: "custom-provider", requestedDepth: null },
      ]),
    ).toEqual([
      {
        billableUnits: 14,
        checks: 2,
        provider: "custom-provider",
        providerLabel: "Custom Provider",
        rateBasis: "Rate unavailable",
        referenceCostCents: 0,
        referenceCostKnown: false,
      },
    ]);
  });
});
