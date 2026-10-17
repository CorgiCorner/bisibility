import { providerConnectionRevision } from "@/lib/providers/connection-revision";
import type { FrozenComparison } from "./model";
export function comparisonFixture(fundingSource: "own" | "hosted" = "own"): FrozenComparison {
  return {
    version: 1,
    keywordId: "keyword",
    text: "Example service",
    device: "desktop",
    domain: "example.com",
    locationId: "location",
    locationLabel: "Poland",
    location: {
      gl: "pl",
      hl: "pl",
      primaryGeoCode: 2616,
      primaryGeoName: "Poland",
      secondaryGeoName: "Poland",
    },
    connections: ["dataforseo", "serpapi"].map((provider) => ({
      provider: provider as "dataforseo" | "serpapi",
      id: `connection-${provider}`,
      revision: providerConnectionRevision({
        id: `connection-${provider}`,
        projectId: "project",
        provider,
        kind: "serp",
        enabled: true,
        status: "connected",
        credentialSource: fundingSource,
        credentialsEncrypted: "encrypted-fixture",
        providerUiRevision: 4n,
      }),
      credentialVersion: "binding",
      fundingSource,
      providerEstimateCents: provider === "serpapi" ? 4 : 2,
      customerEstimateCents: fundingSource === "hosted" ? 6 : provider === "serpapi" ? 4 : 2,
      quote: {
        provider: provider as "dataforseo" | "serpapi",
        estimatedCostCents: fundingSource === "hosted" ? 6 : provider === "serpapi" ? 4 : 2,
        nativeUnit: provider === "serpapi" ? "searches" : "cents",
        nativeQuantity: provider === "serpapi" ? 2 : 2,
        fundingSource,
      },
    })),
  };
}
