import { type AiOverviewCitation, aiOverviewCitation } from "@/lib/checks/ai-overview-citation";
import { aiOverviewPresentation } from "@/lib/checks/ai-overview-presentation";
import { pagePathForProject } from "@/lib/pages/page-path";

export type RankTrackerAiOverviewFact = {
  keywordId: string;
  checkedAt: string;
  citation: AiOverviewCitation;
  overview: {
    present: boolean;
    paragraphs: string[];
    sources: { title: string; url: string }[];
    sections?: { heading?: string; text: string; markdown?: string }[];
  } | null;
  citedPath: string | null;
};

export type AiOverviewItemRow = {
  keywordId: string;
  checkedAt: Date | string;
  title: string | null;
  rawFragment: unknown;
};

export function aiOverviewFactsFromRows(
  rows: readonly AiOverviewItemRow[],
  domain: string | null,
): RankTrackerAiOverviewFact[] {
  const grouped = new Map<
    string,
    { checkedAt: string; items: { title: string | null; rawFragment: unknown }[] }
  >();
  for (const row of rows) {
    const checkedAt = new Date(row.checkedAt).toISOString();
    const current = grouped.get(row.keywordId) ?? { checkedAt, items: [] };
    if (row.rawFragment != null || row.title?.trim())
      current.items.push({ title: row.title, rawFragment: row.rawFragment });
    grouped.set(row.keywordId, current);
  }
  return [...grouped].map(([keywordId, value]) => {
    const citation = aiOverviewCitation(value.items, domain);
    const presentation = citation.shown ? aiOverviewPresentation(value.items) : null;
    return {
      keywordId,
      checkedAt: value.checkedAt,
      citation,
      overview: presentation ? { present: true, ...presentation } : null,
      citedPath: citation.citedUrl && domain ? pagePathForProject(domain, citation.citedUrl) : null,
    };
  });
}
