import { mergeTrackingRows } from "@/lib/ai-tracking/projections/pagination";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { trackingCsv } from "./csv";

export async function collectTrackingDownload(
  runId: string,
  format: "json" | "csv",
  fetchPage: (
    cursor?: string,
  ) => Promise<{ items: TrackingSampleRow[]; nextCursor: string | null }>,
  startCursor?: string,
  maxPages = 20,
) {
  let cursor = startCursor;
  let items: TrackingSampleRow[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor);
    items = mergeTrackingRows(items, result.items);
    if (!result.nextCursor) {
      cursor = undefined;
      break;
    }
    if (seen.has(result.nextCursor)) throw new Error("Export pagination did not advance.");
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  const complete = !cursor;
  return {
    complete,
    loaded: items.length,
    nextCursor: cursor ?? null,
    content:
      format === "json"
        ? JSON.stringify(
            {
              runId,
              items,
              nextCursor: cursor ?? null,
              scope: { complete, maxPages, loaded: items.length, resumed: Boolean(startCursor) },
            },
            null,
            2,
          )
        : trackingCsv(
            items.map((row) => ({
              sampleId: row.id,
              runId,
              promptRevisionId: row.promptRevisionId,
              prompt: row.prompt,
              source: row.source,
              engine: row.engine,
              actualModel: row.evidence?.actualModel ?? null,
              measurement: row.measurement,
              observedAt: row.evidence?.observedAt ?? null,
              recordedSource: row.evidence?.recordedSource ?? null,
              answer: row.evidence?.answerText ?? null,
              citations: row.citations.map((citation) => citation.url),
              costUsd: row.costUsd,
              costState: row.costState,
            })),
            { complete, nextCursor: cursor ?? null, resumed: Boolean(startCursor) },
          ),
  };
}
