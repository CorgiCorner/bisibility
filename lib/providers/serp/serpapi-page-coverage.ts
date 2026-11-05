import { OrganicCoverageError } from "./organic-coverage-error";
import { type SerpApiResponse, serpApiOrganicCandidates } from "./serpapi-payload";

function requireNextOffset(next: string | undefined, start: number) {
  if (!next) return;
  let offset: string | null;
  try {
    offset = new URL(next, "https://serpapi.com").searchParams.get("start");
  } catch {
    throw new OrganicCoverageError("invalid page continuation");
  }
  if (offset !== null && (!/^\d+$/.test(offset) || Number(offset) !== start + 10))
    throw new OrganicCoverageError("continuation did not advance to the next page");
}

function requireDistinctRows(results: readonly unknown[], links: Set<string>) {
  const positions = new Set<number>();
  for (const value of results) {
    if (!value || typeof value !== "object") continue;
    const row = value as { position?: unknown; link?: unknown };
    if (typeof row.position === "number") {
      if (positions.has(row.position))
        throw new OrganicCoverageError("overlapping organic positions");
      positions.add(row.position);
    }
    if (typeof row.link !== "string") continue;
    const link = row.link.trim();
    if (links.has(link)) throw new OrganicCoverageError("overlapping organic destinations");
    links.add(link);
  }
}

/** Validate page progression and retain the continuous observed organic prefix. */
export function serpApiPageCoverage() {
  const identities = new Set<string>();
  const links = new Set<string>();
  const ranks = new Set<number>();
  let coveredPrefix = 0;
  let organicCount = 0;
  let previousStart = -1;
  return (data: SerpApiResponse, start: number, results: readonly unknown[]) => {
    const reportedStart = data.search_parameters?.start;
    if (start <= previousStart || (reportedStart !== undefined && Number(reportedStart) !== start))
      throw new OrganicCoverageError("page start did not advance as requested");
    requireNextOffset(data.serpapi_pagination?.next, start);
    requireNextOffset(data.serpapi_pagination?.next_link, start);
    requireNextOffset(data.pagination?.next, start);
    const identity = data.search_metadata?.id;
    if (identity && identities.has(identity))
      throw new OrganicCoverageError("repeated native page identity");
    requireDistinctRows(results, links);
    const candidates = serpApiOrganicCandidates(results, organicCount, start);
    for (const { rank } of candidates) {
      if (typeof rank !== "number" || !Number.isSafeInteger(rank) || rank < 1) continue;
      if (ranks.has(rank)) throw new OrganicCoverageError("overlapping absolute organic positions");
      ranks.add(rank);
    }
    while (ranks.has(coveredPrefix + 1)) coveredPrefix += 1;
    organicCount += results.length;
    if (identity) identities.add(identity);
    previousStart = start;
    return { candidates, coveredPrefix };
  };
}
