import { domainMatches } from "@/lib/domains/normalize";
import { type CompetitorPolicy, competitorAppliesToMarket } from "./serp-comparison";

export type CompetitorSnapshot = {
  locationId: string;
  ownPosition: number | null;
  ranks: readonly { domain: string; position: number }[] | null;
};
export type OverviewCompetitorRow = {
  id: string;
  domain: string;
  label: string;
  found: number;
  checked: number;
  above: number;
  paired: number;
  averagePosition: number | null;
};
export type OverviewCompetitorComparison = { rows: OverviewCompetitorRow[]; limited: boolean };

export function summarizeOverviewCompetitors(
  competitors: readonly CompetitorPolicy[],
  snapshots: readonly CompetitorSnapshot[],
): OverviewCompetitorRow[] {
  return competitors
    .flatMap((competitor) => {
      const eligible = snapshots.filter((snapshot) =>
        competitorAppliesToMarket(competitor, snapshot.locationId),
      );
      if (eligible.length === 0) return [];
      const row: OverviewCompetitorRow = {
        id: competitor.publicId,
        domain: competitor.domain,
        label: competitor.label ?? competitor.domain,
        found: 0,
        checked: 0,
        above: 0,
        paired: 0,
        averagePosition: null,
      };
      let sum = 0;
      for (const snapshot of eligible) {
        if (snapshot.ranks === null) continue;
        row.checked++;
        const positions = snapshot.ranks
          .filter((rank) => domainMatches(rank.domain, competitor.domain) && rank.position > 0)
          .map((rank) => rank.position);
        if (positions.length === 0) continue;
        const best = Math.min(...positions);
        row.found++;
        sum += best;
        if (snapshot.ownPosition !== null && snapshot.ownPosition > 0) {
          row.paired++;
          if (best < snapshot.ownPosition) row.above++;
        }
      }
      row.averagePosition = row.found ? Math.round((sum / row.found) * 10) / 10 : null;
      return [row];
    })
    .sort(
      (left, right) =>
        right.above - left.above ||
        right.found - left.found ||
        left.domain.localeCompare(right.domain),
    );
}
