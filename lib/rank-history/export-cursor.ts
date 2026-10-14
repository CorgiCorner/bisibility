import type { ReportCursorCodec, ReportCursorPayload } from "@/lib/rank-reports/cursor";
import { reportDigest } from "@/lib/rank-reports/digest";
import { RankReportCursorError, RankReportSnapshotConflictError } from "@/lib/rank-reports/errors";
import type { HistoryExportAuthority } from "./export-authority";
import type { HistoryExportSnapshot } from "./export-snapshot";
import type { HistoryExportRequest } from "./report-export-model";

export function decodeExportCursor(input: HistoryExportRequest, codec: ReportCursorCodec) {
  // V1 retains genuine legacy offset cursors. Only opt-in V2 owns the signed snapshot contract.
  return input.version === "2" && input.cursor ? codec.decode(input.cursor) : null;
}
export function exportCursorBinding(
  context: HistoryExportAuthority,
  input: HistoryExportRequest,
  snapshot: HistoryExportSnapshot,
) {
  const { cursor: _cursor, limit: _limit, format: _format, ...selection } = input;
  return reportDigest({
    purpose: "rank-history-export-v2",
    selection: {
      ...selection,
      ...(selection.keywordIds ? { keywordIds: [...selection.keywordIds].sort() } : {}),
    },
    actor: context.actor.id,
    credential: context.credential ?? null,
    transport: context.transport,
    projectId: snapshot.project.publicId,
    policy: snapshot.policy,
    asOf: snapshot.asOf,
  });
}
export function verifyExportCursor(
  cursor: ReportCursorPayload | null,
  binding: string,
  snapshot: HistoryExportSnapshot,
) {
  if (!cursor) return;
  if (cursor.binding !== binding || cursor.asOf !== snapshot.asOf)
    throw new RankReportCursorError();
  if (cursor.source !== snapshot.sourceDigest) throw new RankReportSnapshotConflictError();
}
