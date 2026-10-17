import { researchScopeKey } from "@/lib/research/scope";
import type { ResearchTab } from "./research-workspace-model";
export function normalizeResearchSeed(seed: string) {
  return seed.trim().replace(/\s+/g, " ").toLowerCase();
}
export function uniqueResearchSeeds(seeds: readonly string[]) {
  return [...new Set(seeds.map(normalizeResearchSeed).filter(Boolean))];
}
export function researchTabIdentity(
  tab: Pick<
    ResearchTab,
    "connectionId" | "includeClickstream" | "scope" | "mode" | "requestedLimit" | "seed"
  >,
) {
  return JSON.stringify([
    tab.connectionId ?? "",
    normalizeResearchSeed(tab.seed),
    researchScopeKey(tab.scope),
    tab.mode,
    tab.requestedLimit,
    tab.includeClickstream,
  ]);
}
export const MAX_RESEARCH_TABS = 20;

export function mergeResearchTabs(
  current: readonly ResearchTab[],
  next: readonly ResearchTab[],
): ResearchTab[] {
  const seen = new Set<string>();
  return [...next, ...current]
    .filter((tab) => {
      const identity = researchTabIdentity(tab);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .slice(0, MAX_RESEARCH_TABS);
}
