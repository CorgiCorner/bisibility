import type { RetrievedResults } from "@/lib/checks/contract";
import { domainMatches, normalizeDomain } from "@/lib/domains/normalize";

export type TrackedCompetitor = { domain: string; label: string | null; publicId: string };
export type CompetitorPolicy = TrackedCompetitor & {
  scopePolicy: "all_markets" | "selected_markets";
  marketOverrides: { mode: "added" | "excluded"; projectMarket: { locationId: string } }[];
};

export function competitorAppliesToMarket(competitor: CompetitorPolicy, locationId: string) {
  const override = competitor.marketOverrides.find(
    (item) => item.projectMarket.locationId === locationId,
  );
  return competitor.scopePolicy === "selected_markets"
    ? override?.mode === "added"
    : override?.mode !== "excluded";
}

export function matchingCompetitor(domain: string, competitors: readonly TrackedCompetitor[]) {
  return competitors
    .filter((competitor) => domainMatches(domain, competitor.domain))
    .sort((left, right) => right.domain.length - left.domain.length)[0];
}

export type SerpComparisonRow = {
  id: string;
  domain: string;
  label: string;
  own: boolean;
  position: number | null;
  gap: number | null;
  url: string | null;
};

export function buildSerpComparison(
  results: RetrievedResults,
  competitors: readonly TrackedCompetitor[],
  ownDomain: string,
): SerpComparisonRow[] {
  if (results.tier === "none") return [];
  const rows =
    results.tier === "full"
      ? results.rows
      : results.domains.map((row) => ({
          domain: row.domain,
          position: row.bestPosition,
          url: null,
        }));
  function best(domain: string) {
    return rows
      .filter((row) => domainMatches(row.domain, domain) && row.position > 0)
      .sort((left, right) => left.position - right.position)[0];
  }
  const own = best(ownDomain);
  const ownPosition = results.tier === "full" ? results.trackedPosition : (own?.position ?? null);
  return [
    {
      id: "own",
      domain: normalizeDomain(ownDomain) ?? ownDomain,
      label: "Your site",
      own: true,
      position: ownPosition,
      gap: null,
      url: own?.url ?? null,
    },
    ...competitors.map((competitor) => {
      const found = best(competitor.domain);
      return {
        id: competitor.publicId,
        domain: competitor.domain,
        label: competitor.label ?? competitor.domain,
        own: false,
        position: found?.position ?? null,
        gap: found && ownPosition ? found.position - ownPosition : null,
        url: found?.url ?? null,
      };
    }),
  ];
}
