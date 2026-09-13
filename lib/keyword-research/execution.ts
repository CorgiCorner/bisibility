import type { SerpRankLocation } from "@/lib/serp/location";
import { keywordResearchCacheKey, readKeywordResearchCache } from "./cache";
import { normalizeResearchKeyword } from "./request-key";
import { type ResearchSelection, sourceEstimate, sourcesForMode } from "./source-call";
import type {
  KeywordResearchMode,
  KeywordResearchSource,
  KeywordResearchSourceDiagnostic,
  KeywordResearchSourceReason,
} from "./types";

export function keywordResearchSourceKey(input: {
  connectionId: string;
  includeClickstream: boolean;
  limit: number;
  location: SerpRankLocation;
  projectId: string;
  seed: string;
  source: KeywordResearchSource;
}) {
  return keywordResearchCacheKey({
    connectionId: input.connectionId,
    includeClickstream: input.includeClickstream,
    location: input.location,
    normalizedSeed: normalizeResearchKeyword(input.seed),
    projectId: input.projectId,
    resultLimit: input.limit,
    source: input.source,
  });
}

export function remainingResearchDiagnostics(
  sources: KeywordResearchSource[],
  from: number,
  reason: KeywordResearchSourceReason,
): KeywordResearchSourceDiagnostic[] {
  return sources.slice(from).map((source) => ({
    cached: false,
    costCents: 0,
    reason,
    returned: 0,
    source,
    status: "skipped",
  }));
}

export async function estimateKeywordResearch(input: {
  context: Parameters<typeof sourceEstimate>[0]["context"];
  fresh?: boolean;
  includeClickstream: boolean;
  limit: number;
  location: SerpRankLocation;
  mode: KeywordResearchMode;
  projectId: string;
  seed: string;
  selected: ResearchSelection;
}): Promise<{ cached: boolean; costCents: number; sources: KeywordResearchSourceDiagnostic[] }> {
  const sources = sourcesForMode(input.mode);
  const diagnostics = await Promise.all(
    sources.map(async (source) => {
      const cachedEntry = input.fresh
        ? null
        : await readKeywordResearchCache(
            keywordResearchSourceKey({
              connectionId: input.selected.connection.id,
              includeClickstream: input.includeClickstream,
              limit: input.limit,
              location: input.location,
              projectId: input.projectId,
              seed: input.seed,
              source,
            }),
          );
      const cached = Boolean(cachedEntry);
      return {
        cached,
        costCents: cached ? 0 : sourceEstimate({ ...input, source }),
        returned: 0,
        source,
        status: "ok" as const,
      };
    }),
  );
  return {
    cached: diagnostics.every((source) => source.cached),
    costCents: diagnostics.reduce((sum, source) => sum + source.costCents, 0),
    sources: diagnostics,
  };
}
