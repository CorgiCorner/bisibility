import type { RetrievedResults } from "@/lib/checks/contract";
import { csvRow } from "@/lib/ui/csv";

type FullSnapshot = Extract<RetrievedResults, { tier: "full" }>;

export function snapshotRows(results: FullSnapshot) {
  return [...results.rows, ...(results.extension?.pages.flatMap((page) => page.rows) ?? [])];
}

export function snapshotCsv(results: FullSnapshot) {
  return [
    csvRow(["rank", "title", "url", "domain", "result_type", "resolution_status"]),
    ...snapshotRows(results).map((row) =>
      csvRow([
        row.position,
        row.title,
        row.url,
        row.domain,
        row.resultType ?? "organic",
        row.resolutionStatus ?? null,
      ]),
    ),
  ].join("\n");
}

export function snapshotJson(results: FullSnapshot) {
  return JSON.stringify(
    {
      checkId: results.checkId,
      observedAt: results.observedAt ?? results.checkedAt,
      provider: results.provider,
      organicResults: snapshotRows(results),
      normalization: results.storedData?.normalization ?? null,
      observationItems: results.storedData?.observationItems ?? [],
      scope: results.storedData?.scope ?? null,
      extendedRanges:
        results.extension?.pages.map((page) => ({
          start: page.start,
          fetchedAt: page.fetchedAt,
          rows: page.rows,
        })) ?? [],
    },
    null,
    2,
  );
}

export function snapshotExportName(
  keyword: string,
  market: { location: string; device: string },
  results: Pick<FullSnapshot, "checkedAt" | "observedAt">,
  format: "csv" | "json",
) {
  const slug = (value: string) =>
    value
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  return `${[keyword || "keyword", market.location, market.device, (results.observedAt ?? results.checkedAt).slice(0, 10)].map(slug).join("-")}.${format}`;
}
