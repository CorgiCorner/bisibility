import { domainMatches, normalizeDomain } from "@/lib/domains/normalize";
import type { CompetitorSuggestionEvidence } from "@/lib/getting-started/setup-steps";
import {
  organicDomainRanksFromRaw,
  storedOrganicDomainRanks,
} from "@/lib/rank-check/organic-ranks";
import { parse } from "tldts";

type KeywordSnapshot = {
  text: string;
  rankChecks: readonly { organicRanks: unknown; raw: unknown }[];
};

// These hosts aggregate projects or people. Recurrence alone cannot establish competition.
const platforms = [
  "github.com",
  "gitlab.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "wikipedia.org",
  "glama.ai",
  "g2.com",
  "capterra.com",
  "producthunt.com",
  "alternativeto.net",
];

function tokens(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function containsBrand(value: string, brand: readonly string[]) {
  const parts = tokens(value);
  return (
    brand.length > 0 &&
    parts.some((_, start) => brand.every((part, i) => parts[start + i] === part))
  );
}

function platformDomain(domain: string) {
  return platforms.some((platform) => domainMatches(domain, platform));
}

/** Only suppress a platform's evidence if every observed URL describes this project's brand. */
function ownPlatformDomains(raw: unknown, brand: readonly string[]) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("organic_results" in raw) ||
    !Array.isArray(raw.organic_results)
  )
    return new Set<string>();
  const ownership = new Map<string, boolean>();
  for (const item of raw.organic_results) {
    if (!item || typeof item !== "object") continue;
    const value = "url" in item ? item.url : "link" in item ? item.link : null;
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      const domain = normalizeDomain(value);
      if (!domain || !platformDomain(domain)) continue;
      const brandedPath = containsBrand(decodeURIComponent(url.pathname), brand);
      ownership.set(domain, (ownership.get(domain) ?? true) && brandedPath);
    } catch {
      /* Unusable evidence is ignored. */
    }
  }
  return new Set([...ownership].filter(([, owned]) => owned).map(([domain]) => domain));
}

/** Latest snapshots only. Phrase coverage is independent of devices, markets and historical runs. */
export function competitorSuggestionEvidence(
  projectDomain: string,
  keywords: readonly KeywordSnapshot[],
  excludedDomains: ReadonlySet<string>,
): CompetitorSuggestionEvidence[] {
  const brand = tokens(parse(projectDomain).domainWithoutSuffix ?? "");
  const measured = new Set<string>();
  const candidates = new Map<
    string,
    { bestPosition: number; phrases: Set<string>; nonBrand: Set<string> }
  >();
  for (const keyword of keywords) {
    const check = keyword.rankChecks[0];
    if (!check) continue;
    const ranks =
      storedOrganicDomainRanks(check.organicRanks) ?? organicDomainRanksFromRaw(check.raw);
    if (!ranks) continue;
    const phrase = tokens(keyword.text).join(" ");
    if (!phrase) continue;
    measured.add(phrase);
    const branded = containsBrand(keyword.text, brand);
    const ownPlatforms = ownPlatformDomains(check.raw, brand);
    for (const rank of ranks) {
      const domain = normalizeDomain(rank.domain);
      if (
        !domain ||
        domainMatches(domain, projectDomain) ||
        ownPlatforms.has(domain) ||
        [...excludedDomains].some((excluded) => domainMatches(domain, excluded))
      )
        continue;
      const evidence = candidates.get(domain) ?? {
        bestPosition: rank.position,
        phrases: new Set<string>(),
        nonBrand: new Set<string>(),
      };
      evidence.bestPosition = Math.min(evidence.bestPosition, rank.position);
      evidence.phrases.add(phrase);
      if (!branded) evidence.nonBrand.add(phrase);
      candidates.set(domain, evidence);
    }
  }
  return [...candidates]
    .map(([domain, evidence]) => ({
      bestPosition: evidence.bestPosition,
      domain,
      of: measured.size,
      seenOn: evidence.phrases.size,
      nonBrandSeenOn: evidence.nonBrand.size,
      kind: platformDomain(domain)
        ? ("platform" as const)
        : evidence.nonBrand.size >= 2
          ? ("competitor" as const)
          : ("other" as const),
    }))
    .sort(
      (a, b) =>
        Number(b.kind === "competitor") - Number(a.kind === "competitor") ||
        b.nonBrandSeenOn - a.nonBrandSeenOn ||
        b.seenOn - a.seenOn ||
        a.bestPosition - b.bestPosition ||
        a.domain.localeCompare(b.domain),
    );
}
