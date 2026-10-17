import "server-only";
import { AI_RESEARCH_PROVIDER_ID } from "@/lib/ai-research/catalog-types";
import { PROVIDER_CATALOG } from "./catalog-metadata";
import { getSerpProvider } from "./registry";
export type ResearchModule = "keywordResearch" | "backlinks" | "domainOverview" | "aiResearch";
/** Match the module's complete adapter contract, not merely its provider category. */
export function moduleSupport(module: ResearchModule): { supportingProviders?: string[] } {
  const providers = PROVIDER_CATALOG.filter((entry) => entry.kind === "serp").filter((entry) => {
    if (module === "aiResearch") return entry.id === AI_RESEARCH_PROVIDER_ID;
    const p = getSerpProvider(entry.id);
    if (module === "keywordResearch")
      return Boolean(p.fetchRelatedKeywords && p.fetchKeywordSuggestions && p.fetchKeywordIdeas);
    if (module === "backlinks")
      return Boolean(p.fetchBacklinksSummary && p.fetchBacklinksHistory && p.fetchBacklinksRows);
    return Boolean(
      p.fetchDomainRankOverview &&
        p.fetchHistoricalRankOverview &&
        p.fetchRankedKeywords &&
        p.fetchRelevantPages,
    );
  });
  return { supportingProviders: providers.map((provider) => provider.label) };
}
