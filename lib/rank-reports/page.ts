import { RankReportSnapshotConflictError } from "./errors";
import type { RankReportRequest, ReportPageKey } from "./model";

type Timed = { id: string; observedAt?: string | null; recordedAt: string };
export function recordInReportWindow(record: Timed, window: RankReportRequest["window"]) {
  const time = window.basis === "observed_at" ? (record.observedAt ?? null) : record.recordedAt;
  return (
    time !== null &&
    Date.parse(time) >= Date.parse(window.from) &&
    Date.parse(time) <= Date.parse(window.to)
  );
}

function compareKeys(a: ReportPageKey, b: ReportPageKey) {
  return Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id);
}
export function pageRankReportRecords<T extends Timed>(
  rows: readonly T[],
  request: RankReportRequest,
  last: ReportPageKey | null,
) {
  const missingObservationTime = rows.filter((row) => row.observedAt == null).length;
  const filtered = rows.filter((row) => recordInReportWindow(row, request.window));
  const keyed = filtered
    .map((record) => ({
      key: {
        at:
          request.stream === "attempts"
            ? record.recordedAt
            : (record.observedAt ?? record.recordedAt),
        id: record.id,
      },
      record,
    }))
    .sort((a, b) => compareKeys(a.key, b.key));
  if (new Set(keyed.map(({ key }) => JSON.stringify(key))).size !== keyed.length)
    throw new RankReportSnapshotConflictError();
  const after = last ? keyed.filter(({ key }) => compareKeys(key, last) > 0) : keyed;
  const records = after.slice(0, request.pageLimit);
  return {
    excludedUnknownTime: request.window.basis === "observed_at" ? missingObservationTime : 0,
    last: after.length > records.length ? (records.at(-1)?.key ?? null) : null,
    records: records.map(({ record }) => record),
    totalCount: filtered.length,
  };
}
