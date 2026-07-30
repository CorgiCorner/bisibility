import "server-only";

import {
  keywordResearchRate,
  type KeywordResearchSource as RateSource,
} from "@/lib/cost-estimate/provider-rates";
import { ProviderLookupSignal, requiredEstimatedCostCents } from "@/lib/provider-lookups/paid-call";
import type { ProviderRateContext } from "@/lib/provider-rates/connection-context";
import type { ProviderCredentials, ResearchPage } from "@/lib/providers/types";
import type { eligibleResearchConnections, researchLocation } from "./context";
import { paidProviderCall } from "./paid-call";
import type { KeywordResearchMode, KeywordResearchSource } from "./types";

export type ResearchSelection = ReturnType<typeof eligibleResearchConnections>[number];

function sourceConfig(source: KeywordResearchSource) {
  if (source === "related") return { method: "fetchRelatedKeywords", rate: "related" } as const;
  if (source === "suggestion")
    return { method: "fetchKeywordSuggestions", rate: "suggestions" } as const;
  return { method: "fetchKeywordIdeas", rate: "ideas" } as const;
}

export function sourcesForMode(mode: KeywordResearchMode): KeywordResearchSource[] {
  if (mode === "auto") return ["related", "suggestion", "idea"];
  if (mode === "related") return ["related"];
  if (mode === "suggestions") return ["suggestion"];
  return ["idea"];
}

function sourceRate(selected: ResearchSelection, source: KeywordResearchSource) {
  return keywordResearchRate(selected.provider.id, sourceConfig(source).rate as RateSource);
}

export function sourceEstimate(input: {
  context: ProviderRateContext;
  includeClickstream: boolean;
  limit: number;
  selected: ResearchSelection;
  source: KeywordResearchSource;
}) {
  return requiredEstimatedCostCents({
    context: input.context,
    includeClickstream: input.includeClickstream,
    itemCount: input.limit,
    providerId: input.selected.provider.id,
    rate: sourceRate(input.selected, input.source),
  });
}

export async function callResearchSource(input: {
  /** Cap from the already-loaded research project row; skips the budget-gate cap query. */
  budgetCapCents?: number;
  includeClickstream: boolean;
  limit: number;
  location: Awaited<ReturnType<typeof researchLocation>>["value"];
  projectId: string;
  rateContext: ProviderRateContext;
  seed: string;
  selected: ResearchSelection;
  source: KeywordResearchSource;
}) {
  const config = sourceConfig(input.source);
  const method = input.selected.provider[config.method] as
    | ((
        credentials: ProviderCredentials,
        options: {
          includeClickstream: boolean;
          limit: number;
          location: typeof input.location;
          seed: string;
        },
      ) => Promise<ResearchPage>)
    | undefined;
  if (!method) throw new ProviderLookupSignal({ ok: false, reason: "no_source" });
  return paidProviderCall({
    budgetCapCents: input.budgetCapCents,
    call: (credentials) =>
      method.call(input.selected.provider, credentials, {
        includeClickstream: input.includeClickstream,
        limit: input.limit,
        location: input.location,
        seed: input.seed,
      }),
    connection: input.selected.connection,
    feature: "keyword_research",
    includeClickstream: input.includeClickstream,
    itemCount: input.limit,
    projectId: input.projectId,
    provider: input.selected.provider,
    rateContext: input.rateContext,
    rate: sourceRate(input.selected, input.source),
  });
}
