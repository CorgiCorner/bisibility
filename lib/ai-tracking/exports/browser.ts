"use client";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { collectTrackingDownload } from "./download";

export async function downloadTrackingEvidence(
  runId: string,
  format: "json" | "csv",
  fetchPage: (
    cursor?: string,
  ) => Promise<{ items: TrackingSampleRow[]; nextCursor: string | null }>,
  cursor?: string,
) {
  const result = await collectTrackingDownload(runId, format, fetchPage, cursor);
  const url = URL.createObjectURL(
    new Blob([result.content], { type: format === "csv" ? "text/csv" : "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `ai-tracking-${runId}${result.complete ? "" : "-incomplete"}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
  return { complete: result.complete, loaded: result.loaded, nextCursor: result.nextCursor };
}
