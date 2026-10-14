import type { WebObservationRunInput } from "@/lib/observation/types";
import type { SerpRankInput } from "@/lib/providers/types";
import { DEFAULT_SERP_DEPTH, resolveSerpStopOnMatch } from "@/lib/serp/constants";
import { SYNTHETIC_SERP_ADAPTER_VERSION, syntheticSerpAdapterActive } from "./synthetic-mode";

/** Positive fixture evidence only. No absence, complete-prefix or provider-observed scope claim. */
export function syntheticSerpObservation(
  providerId: string,
  input: SerpRankInput,
  result: { checkedAt: Date; position: number; rankingUrl: string },
): WebObservationRunInput {
  if (!syntheticSerpAdapterActive(providerId))
    throw new Error("Synthetic SERP adapter is inactive.");
  return {
    provider: providerId,
    surface: "web_serp",
    engine: "google",
    completeness: "unknown",
    configuredScope: {
      location: input.location.primaryGeoName,
      language: input.location.hl,
      device: input.device,
    },
    effectiveScope: null,
    executedAt: result.checkedAt,
    requestPolicy: {
      depth: input.depth ?? DEFAULT_SERP_DEPTH,
      stopOnMatch: resolveSerpStopOnMatch(input.stopOnMatch),
      findTargetsIn: null,
      forcedAiOverview: false,
      evidence: {
        version: 1,
        adapterVersion: SYNTHETIC_SERP_ADAPTER_VERSION,
        observedAt: null,
        requestedAt: null,
        completeThrough: { organic_result: null, local_pack: null, ai_overview: null },
      },
    },
    items: [
      {
        resultKind: "organic_result",
        rankScale: "organic_group",
        rankGroup: result.position,
        promotion: "organic",
        url: result.rankingUrl,
        domain: input.domain,
        rawFragment: { synthetic: true },
      },
    ],
  };
}
