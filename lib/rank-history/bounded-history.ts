import type { RankHistoryExportOptions } from "./export-service";
import type { HistoryExportSnapshot } from "./export-snapshot";

export function historyRangeStart(range: RankHistoryExportOptions["range"], asOf: Date) {
  if (range === "all") return new Date(0);
  // Preserve v1's calendar-day subtraction, including host timezone/DST behavior.
  const start = new Date(asOf.getTime());
  start.setDate(start.getDate() - Number(range));
  return start;
}
/** Compatibility projection only. V1 is not relabelled as qualified v2 evidence. */
export function legacyHistoryFromSnapshot(
  snapshot: HistoryExportSnapshot,
  input: Pick<RankHistoryExportOptions, "range" | "keywordIds">,
) {
  const start = historyRangeStart(input.range, new Date(snapshot.asOf));
  const targets = new Map(snapshot.targets.map((target) => [target.id, target]));
  const order = input.keywordIds ? new Map(input.keywordIds.map((id, index) => [id, index])) : null;
  const keywords = snapshot.keywords.map((keyword) => ({
    ...keyword,
    rankChecks: (targets.get(keyword.publicId)?.checks ?? [])
      .filter(
        (check) =>
          check.status === "completed" && (input.range === "all" || check.checkedAt >= start),
      )
      .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime() || b.id.localeCompare(a.id))
      .map((check) => ({
        checkedAt: check.checkedAt,
        normalizationVersion: check.normalizationVersion,
        position: check.position,
        previousPosition: check.previousPosition ?? null,
        provider: check.provider ?? "",
        publicId: check.id,
        rankingUrl: check.rankingUrl,
        requestedDepth: check.requestedDepth,
      })),
  }));
  if (order)
    keywords.sort(
      (a, b) =>
        (order.get(a.publicId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.publicId) ?? Number.MAX_SAFE_INTEGER),
    );
  return {
    keywords,
    project: snapshot.project,
    asOf: snapshot.asOf,
    sourceDigest: snapshot.sourceDigest,
  };
}
