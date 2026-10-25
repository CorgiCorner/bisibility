import { findLiteralWordMatch } from "@/lib/ai-tracking/literal-match";
import { citedDomain } from "./normalize";
import type { AiResearchRow } from "./types";

export function normalizedResearchText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function questionGroupKey(value: string) {
  return normalizedResearchText(value)
    .replace(/\b(?:(?:in|for)\s+)?(?:19|20)\d{2}\b/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word && !["a", "an", "any", "the"].includes(word))
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word,
    )
    .join(" ");
}
export function researchKeywords(topics: readonly string[], keywords: readonly string[]) {
  return [
    ...new Set(
      [...topics, ...keywords]
        .map(normalizedResearchText)
        .filter((value) => value.length > 0 && value.length <= 100),
    ),
  ];
}
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export type ResearchedPrompt = {
  text: string;
  rowIndex: number;
  variants: string[];
  tracked: boolean;
  brandMentioned: boolean;
  ownDomainCited: boolean;
  contentTruncated: boolean;
  sources: { url: string; title: string; domain: string; own: boolean }[];
};
export function projectResearchQuestions(
  rows: readonly AiResearchRow[],
  project: { domain: string; brand: string; tracked: readonly string[] },
): ResearchedPrompt[] {
  const tracked = new Set(project.tracked.map(questionGroupKey));
  const groups = new Map<string, { row: AiResearchRow; index: number }[]>();
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (b.row.datasetVolume ?? 0) - (a.row.datasetVolume ?? 0));
  for (const entry of ordered) {
    const key = questionGroupKey(entry.row.prompt);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const leader = group[0];
    const sources = new Map<string, ResearchedPrompt["sources"][number]>();
    for (const { row } of group)
      for (const citation of row.citations) {
        if (!sources.has(citation.url))
          sources.set(citation.url, {
            url: citation.url,
            title: citation.title,
            domain: new URL(citation.url).hostname,
            own: citedDomain(citation.url, project.domain),
          });
      }
    return {
      text: capitalize(leader.row.prompt),
      rowIndex: leader.index,
      variants: [...new Set(group.slice(1).map(({ row }) => capitalize(row.prompt)))].filter(
        (text) => text !== capitalize(leader.row.prompt),
      ),
      sources: [...sources.values()],
      ownDomainCited: [...sources.values()].some((source) => source.own),
      brandMentioned: group.some(({ row }) =>
        [project.brand, project.domain].some((alias) =>
          Boolean(
            findLiteralWordMatch(row.answer.normalize("NFKC"), alias.normalize("NFKC"), true),
          ),
        ),
      ),
      tracked: tracked.has(key),
      contentTruncated: group.some(({ row }) => row.contentTruncated === true),
    };
  });
}
