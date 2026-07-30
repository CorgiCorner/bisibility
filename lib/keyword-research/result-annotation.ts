import type { ResearchPage } from "@/lib/providers/types";
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
  const tracked = new Set(project.keywords.map((row) => normalizeResearchKeyword(row.text)));
  const saved = new Set(
    project.savedKeywords
      .filter((row) => row.location === locationKey)
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
