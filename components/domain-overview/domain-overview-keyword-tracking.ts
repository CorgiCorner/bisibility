import type { SaveSelectedKeywordsAction } from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import type { RankedKeywordRow } from "@/lib/providers/types";
import type { DomainOverviewMarketView } from "./domain-overview-workspace-model";

export type SaveDomainKeywords = (
  rows: readonly RankedKeywordRow[],
) => ReturnType<SaveSelectedKeywordsAction>;

export function saveDomainKeywords(
  action: SaveSelectedKeywordsAction,
  input: {
    market: DomainOverviewMarketView;
    projectId: string;
    report: DomainOverviewReport;
    rows: readonly RankedKeywordRow[];
  },
) {
  return action({
    languageCode: input.report.languageCode,
    locationCode: input.report.locationCode,
    projectId: input.projectId,
    rows: input.rows.map((row) => ({
      cpcCents: row.cpcCents,
      difficulty: row.difficulty,
      intent: row.intent,
      keyword: row.keyword,
      location: input.market.canonicalKey,
      searchVolume: row.searchVolume,
      sourceSeed: input.report.target,
      variantCount: 0,
    })),
    scopeOverride: input.report.scope,
    target: input.report.target,
  });
}
