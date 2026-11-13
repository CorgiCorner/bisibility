import { normalizeBrandMatchText, positiveBrandNames } from "@/lib/ai-tracking/brand-name-match";
import { findLiteralWordMatch } from "@/lib/ai-tracking/literal-match";
import { parse } from "tldts";

export const BRAND_NAME_KEYWORD_LIMIT = 8;
export const BRAND_NAME_KEYWORD_WORDS = 5;

export function domainWithoutTld(domain: string | null | undefined) {
  if (!domain?.trim()) return null;
  const parsed = parse(domain.trim());
  if (!parsed.hostname || !parsed.publicSuffix) return null;
  const suffix = `.${parsed.publicSuffix}`;
  if (!parsed.hostname.toLowerCase().endsWith(suffix.toLowerCase())) return null;
  const stem = parsed.hostname.slice(0, -suffix.length);
  return stem || null;
}

export function suggestBrandNames(input: {
  aliases?: readonly string[];
  domain: string | null;
  excludedNames?: readonly string[];
  includeKeywords: boolean;
  keywordTexts?: readonly string[];
  label: string;
}) {
  const taken = new Set(
    positiveBrandNames(input)
      .concat(input.excludedNames ?? [])
      .map((name) => name.toLowerCase()),
  );
  const keywordSuggestions = input.includeKeywords ? keywordHits(input, taken) : [];
  for (const keyword of keywordSuggestions) taken.add(keyword.toLowerCase());
  const stem = domainWithoutTld(input.domain);
  return {
    domainSuggestion: stem && !taken.has(stem.toLowerCase()) ? stem : null,
    keywordSuggestions,
  };
}

function keywordHits(
  input: { keywordTexts?: readonly string[]; label: string },
  taken: Set<string>,
) {
  const label = normalizeBrandMatchText(input.label);
  const suggestions: string[] = [];
  if (!label) return suggestions;
  for (const text of input.keywordTexts ?? []) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.split(/\s+/).length > BRAND_NAME_KEYWORD_WORDS) continue;
    if (taken.has(trimmed.toLowerCase())) continue;
    if (!findLiteralWordMatch(normalizeBrandMatchText(trimmed), label)) continue;
    suggestions.push(trimmed);
    taken.add(trimmed.toLowerCase());
    if (suggestions.length >= BRAND_NAME_KEYWORD_LIMIT) break;
  }
  return suggestions;
}
