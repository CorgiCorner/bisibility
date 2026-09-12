import type { ResearchPage } from "@/lib/providers/types";
import {
  type ResearchScope,
  researchScopeForLocation,
  researchScopeForLocationKey,
  researchScopeKey,
} from "@/lib/research/scope";
import { normalizeResearchKeyword } from "./request-key";
import type {
  KeywordResearchConnection,
  KeywordResearchOutcome,
  KeywordResearchSource,
  KeywordResearchSuccess,
} from "./types";

export type ResearchAnnotationProject = {
  keywords: Array<{ locationRef: { canonicalKey: string } | null; text: string }>;
  savedKeywords: Array<{ countryCode: string; languageCode: string; normalizedText: string }>;
};

export function annotateResearchRows(
  rows: Array<ResearchPage["rows"][number] & { source: KeywordResearchSource }>,
  project: ResearchAnnotationProject,
  scope: Pick<ResearchScope, "countryCode" | "languageCode">,
) {
  const scopeKey = researchScopeKey(scope);
  const tracked = new Set(
    project.keywords
      .filter(
        (row) =>
          row.locationRef !== null &&
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
  return rows.map((row) => ({
    ...row,
    alreadySaved: saved.has(normalizeResearchKeyword(row.keyword)),
    alreadyTracked: tracked.has(normalizeResearchKeyword(row.keyword)),
  }));
}

export function annotateResearchResult(
  result: Omit<KeywordResearchSuccess, "connections" | "ok" | "provider" | "rows"> & {
    rows: Array<ResearchPage["rows"][number] & { source: KeywordResearchSource }>;
  },
  project: ResearchAnnotationProject,
  provider: string,
  connections: KeywordResearchConnection[],
  locationKey: string,
): KeywordResearchOutcome {
  return {
    ...result,
    connections,
    ok: true,
    provider,
    rows: annotateResearchRows(result.rows, project, researchScopeForLocationKey(locationKey)),
  };
}

export function researchAnnotationScope(countryCode: string, languageCode: string) {
  return researchScopeForLocation({ countryCode, languageCode, languageLabel: languageCode });
}
