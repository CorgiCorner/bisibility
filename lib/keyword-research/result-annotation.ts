import type { ResearchPage } from "@/lib/providers/types";
import { researchScopeForLocationKey, researchScopeKey } from "@/lib/research/scope";
import {
  connectionResources,
  type eligibleResearchConnections,
  type keywordResearchProject,
  normalizeResearchKeyword,
} from "./context";
import type { ResearchSelection } from "./source-call";
import type {
  KeywordResearchOutcome,
  KeywordResearchSource,
  KeywordResearchSuccess,
} from "./types";

export function annotateResearchResult(
  result: Omit<KeywordResearchSuccess, "connections" | "ok" | "provider" | "rows"> & {
    rows: Array<ResearchPage["rows"][number] & { source: KeywordResearchSource }>;
  },
  project: NonNullable<Awaited<ReturnType<typeof keywordResearchProject>>>,
  selected: ResearchSelection,
  eligible: ReturnType<typeof eligibleResearchConnections>,
  locationKey: string,
): KeywordResearchOutcome {
  const scope = researchScopeForLocationKey(locationKey);
  const scopeKey = researchScopeKey(scope);
  const tracked = new Set(
    project.keywords
      .filter(
        (row) =>
          researchScopeKey(researchScopeForLocationKey(row.locationRef.canonicalKey)) === scopeKey,
      )
      .map((row) => normalizeResearchKeyword(row.text)),
  );
  const saved = new Set(
    project.savedKeywords
      .filter(
        (row) => row.countryCode === scope.countryCode && row.languageCode === scope.languageCode,
      )
      .map((row) => row.normalizedText),
  );
  return {
    ...result,
    connections: connectionResources(eligible),
    ok: true,
    provider: selected.provider.label,
    rows: result.rows.map((row) => ({
      ...row,
      alreadySaved: saved.has(normalizeResearchKeyword(row.keyword)),
      alreadyTracked: tracked.has(normalizeResearchKeyword(row.keyword)),
    })),
  };
}
