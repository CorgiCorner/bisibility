import type { ComparisonPreview } from "@/lib/provider-comparison/types";
// Fixtures only: this module has no provider transport or server imports.
export async function previewSerpOverviewFetchAction(): Promise<ComparisonPreview> {
  return {
    id: "story-preview",
    hash: "story-hash",
    expiresAt: "2099-11-09T10:00:00Z",
    depth: 10,
    keyword: {
      id: "",
      text: "What is keyword research?",
      device: "desktop",
      locationLabel: "United States",
    },
    search: { locationKey: "US", locationKind: "country", countryCode: "US", language: "en" },
    sides: [
      {
        provider: "serpapi",
        estimatedCostCents: 0,
        nativeUnit: "searches",
        nativeQuantity: 2,
        fundingSource: "own",
      },
    ],
  };
}
