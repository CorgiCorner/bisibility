import {
  type BrandNameMatch,
  type BrandNameSet,
  matchBrandNamesInAnswer,
  positiveBrandNames,
} from "@/lib/ai-tracking/brand-name-match";

export const BRAND_NAME_ANSWER_LIMIT = 500;

export type BrandNameHitCount = {
  count: number;
  name: string;
};

/** Read-side recount of current names against stored answer texts. */
export type BrandNameCount = {
  answers: number;
  named: number;
  names: BrandNameHitCount[];
};

export type ProjectBrandNamesView = {
  aliases: string[];
  canWrite: boolean;
  counts: BrandNameCount;
  domain: string | null;
  domainSuggestion: string | null;
  excludedNames: string[];
  keywordSuggestions: string[];
  label: string;
  projectId: string;
};

export function projectBrandNameCounts(
  answers: readonly string[],
  names: BrandNameSet,
): BrandNameCount {
  const configured = positiveBrandNames(names);
  const counts = new Map(configured.map((name) => [name, 0]));
  let named = 0;
  for (const answer of answers) {
    const match = matchBrandNamesInAnswer(answer, names);
    if (match.named) named += 1;
    for (const name of hitNames(match)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return {
    answers: answers.length,
    named,
    names: configured.flatMap((name) => {
      const count = counts.get(name) ?? 0;
      return count > 0 ? [{ name, count }] : [];
    }),
  };
}

function hitNames(match: BrandNameMatch) {
  return new Set(match.matches.map((span) => span.name));
}
