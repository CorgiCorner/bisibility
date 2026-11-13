import { findLiteralWordMatch } from "@/lib/ai-tracking/literal-match";

/**
 * Exclusions filter hits from the existing word matcher. The stored policy id
 * stays `nfkc_unicode_word_v1`: callers treat it as that matcher's label, not
 * as a version that must change when a span filter is added.
 */
export const BRAND_NAME_MATCH_POLICY = "nfkc_unicode_word_v1";

export type BrandNameSet = {
  aliases?: readonly string[];
  domain?: string | null;
  excludedNames?: readonly string[];
  label?: string | null;
};

export type BrandNameSpan = {
  index: number;
  length: number;
  name: string;
};

export type BrandNameMatch = {
  matches: BrandNameSpan[];
  named: boolean;
  /** Index in the NFKC + en-lowercase answer, same coordinate as stored observations. */
  position: number | null;
};

export function normalizeBrandMatchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en");
}

export function positiveBrandNames(names: BrandNameSet) {
  return uniqueNames([names.label, names.domain, ...(names.aliases ?? [])]);
}

function uniqueNames(values: readonly (string | null | undefined)[]) {
  return [
    ...new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];
}

function allLiteralWordMatches(text: string, needle: string) {
  if (!needle) return [];
  const matches: { index: number; length: number }[] = [];
  let offset = 0;
  while (offset < text.length) {
    const match = findLiteralWordMatch(text.slice(offset), needle);
    if (!match) break;
    matches.push({ index: offset + match.index, length: match.length });
    const next = offset + match.index + 1;
    if (next <= offset) break;
    offset = next;
  }
  return matches;
}

function coveredByExclusion(
  span: { index: number; length: number },
  exclusions: readonly { index: number; length: number }[],
) {
  const end = span.index + span.length;
  return exclusions.some(
    (exclusion) => span.index >= exclusion.index && end <= exclusion.index + exclusion.length,
  );
}

/** Whether this entity is named in the answer, and which configured names survive exclusions. */
export function matchBrandNamesInAnswer(answer: string, names: BrandNameSet): BrandNameMatch {
  const normalized = normalizeBrandMatchText(answer);
  const exclusions = uniqueNames(names.excludedNames ?? []).flatMap((name) =>
    allLiteralWordMatches(normalized, normalizeBrandMatchText(name)),
  );
  const matches = positiveBrandNames(names).flatMap((name) =>
    allLiteralWordMatches(normalized, normalizeBrandMatchText(name)).flatMap((span) =>
      coveredByExclusion(span, exclusions) ? [] : [{ name, ...span }],
    ),
  );
  if (!matches.length) return { matches: [], named: false, position: null };
  return {
    matches,
    named: true,
    position: Math.min(...matches.map((match) => match.index)),
  };
}
