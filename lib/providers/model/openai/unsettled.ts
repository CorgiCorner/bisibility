import type { ModelNormalizedResponse } from "@/lib/providers/model/transport-evidence";
import { capability } from "./capabilities";
import type { NativeEnvelope } from "./native-schema";
import { consultedSources } from "./sources";
import { unsettledUsage } from "./unsettled-usage";

/** Unsettled output has not passed terminal answer/identity integrity checks. */
export function unsettledResponse(
  response: NativeEnvelope,
  searchEnabled: boolean,
): ModelNormalizedResponse {
  return {
    actualProviderId: "openai",
    actualModelId: capability(response.model) ? response.model : null,
    state: "unknown",
    failure: "accounting_unknown",
    answer: null,
    truncation: { provider: true, application: false, citations: false },
    citations: [],
    citationTotals: { total: null, omitted: null },
    consultedSources: consultedSources(response, searchEnabled),
    usage: unsettledUsage(response.usage, response.tool_usage, searchEnabled),
    providerCost: {
      amount: null,
      currency: "USD",
      certainty: "unknown",
      basis: "unknown",
      rateCardVersion: null,
    },
    paymentReceipt: null,
    rawEvidenceId: null,
  };
}
