import { domainMatches, normalizeDomain } from "@/lib/domains/normalize";
import type { SerpDepth } from "@/lib/serp/markets";

export const organicResultAnomalyCodes = [
  "organic_rank_missing",
  "organic_rank_invalid",
  "organic_url_invalid",
  "organic_result_unclassifiable",
] as const;

export type OrganicResultAnomalyCode = (typeof organicResultAnomalyCodes)[number];
export type OrganicResultAnomaly = {
  code: OrganicResultAnomalyCode;
  index: number;
};

export type OrganicResultCandidate = {
  domain?: unknown;
  rank?: unknown;
  title?: unknown;
  url?: unknown;
};

export type NormalizedOrganicResult = {
  domain: string;
  rank: number;
  title: string | null;
  url: string;
};

type OrganicResultDecisionBase = {
  anomalies: OrganicResultAnomaly[];
  organicResults: NormalizedOrganicResult[];
  position: number | null;
  rankingUrl: string | null;
};

export type OrganicResultDecision =
  | (OrganicResultDecisionBase & { outcome: "match"; position: number; rankingUrl: string })
  | (OrganicResultDecisionBase & { outcome: "no_match" })
  | (OrganicResultDecisionBase & { outcome: "indeterminate" });

const MAX_ANOMALIES = 20;

export function organicResultNormalization(
  decision: Exclude<OrganicResultDecision, { outcome: "indeterminate" }>,
) {
  return {
    anomalies: decision.anomalies,
    outcome: decision.outcome,
    version: "v2" as const,
  };
}

function candidateDomain(value: unknown) {
  return typeof value === "string" ? normalizeDomain(value) : null;
}

function organicRank(value: unknown) {
  if (value === null || value === undefined) return { state: "missing" as const };
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0
    ? { rank: value, state: "valid" as const }
    : { state: "invalid" as const };
}

function addAnomaly(
  anomalies: OrganicResultAnomaly[],
  code: OrganicResultAnomalyCode,
  index: number,
) {
  if (anomalies.length < MAX_ANOMALIES) anomalies.push({ code, index });
}

function domainState(candidate: OrganicResultCandidate, trackedDomain: string) {
  const domains = [candidateDomain(candidate.domain), candidateDomain(candidate.url)].filter(
    (value): value is string => value !== null,
  );
  if (domains.length === 0) return { state: "unknown" as const };
  const matches = domains.map((domain) => domainMatches(domain, trackedDomain));
  if (matches.some(Boolean) && matches.some((match) => !match)) {
    return { state: "conflicting" as const };
  }
  return { matches: matches.some(Boolean), state: "known" as const };
}

export function decideOrganicResult(input: {
  candidates: readonly OrganicResultCandidate[];
  depth: SerpDepth;
  domain: string;
}): OrganicResultDecision {
  const anomalies: OrganicResultAnomaly[] = [];
  const organicResults: NormalizedOrganicResult[] = [];
  const matches: NormalizedOrganicResult[] = [];
  let matchingRankUncertain = false;
  let usableCandidates = 0;

  input.candidates.forEach((candidate, index) => {
    const classified = domainState(candidate, input.domain);
    if (classified.state !== "known") {
      addAnomaly(anomalies, "organic_result_unclassifiable", index);
      return;
    }

    const ranked = organicRank(candidate.rank);
    if (ranked.state !== "valid") {
      addAnomaly(
        anomalies,
        ranked.state === "missing" ? "organic_rank_missing" : "organic_rank_invalid",
        index,
      );
      if (classified.matches) matchingRankUncertain = true;
      return;
    }
    usableCandidates += 1;
    if (ranked.rank > input.depth) return;

    const url = typeof candidate.url === "string" ? candidate.url : null;
    const domain = url ? normalizeDomain(url) : null;
    if (!url || !domain) {
      addAnomaly(anomalies, "organic_url_invalid", index);
      if (classified.matches) matchingRankUncertain = true;
      return;
    }

    const result = {
      domain,
      rank: ranked.rank,
      title: typeof candidate.title === "string" ? candidate.title : null,
      url,
    };
    organicResults.push(result);
    if (classified.matches) matches.push(result);
  });

  if (matchingRankUncertain || (input.candidates.length > 0 && usableCandidates === 0)) {
    return {
      anomalies,
      organicResults,
      outcome: "indeterminate",
      position: null,
      rankingUrl: null,
    };
  }

  const best = matches.sort((left, right) => left.rank - right.rank)[0];
  return best
    ? {
        anomalies,
        organicResults,
        outcome: "match",
        position: best.rank,
        rankingUrl: best.url,
      }
    : {
        anomalies,
        organicResults,
        outcome: "no_match",
        position: null,
        rankingUrl: null,
      };
}
