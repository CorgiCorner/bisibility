import type { RankReportObservation } from "@/lib/rank-reports/records";
import type { HistoryWindow, ObservationHistoryPage } from "./history-contract";

export type RecordedPlotPoint = {
  at: number;
  observation: RankReportObservation;
  position: number;
};
export type RecordedPlotSegment = { key: string; points: RecordedPlotPoint[] };

export function historyRecordTime(
  record: { observedAt: string | null; recordedAt: string },
  basis: HistoryWindow["basis"],
) {
  const value = basis === "observed_at" ? record.observedAt : record.recordedAt;
  const at = value === null ? NaN : Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

export function historyTimestampFraction(window: HistoryWindow, at: number): number | null {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    !Number.isFinite(at) ||
    from > to ||
    at < from ||
    at > to
  )
    return null;
  return from === to ? 0.5 : (at - from) / (to - from);
}

/** Plot geometry only: scope changes and unknown/absent observations never become connecting ranks. */
export function recordedHistorySegments(page: ObservationHistoryPage) {
  const targets = new Map<string, RankReportObservation[]>();
  for (const record of page.records) {
    const records = targets.get(record.keywordId) ?? [];
    records.push(record);
    targets.set(record.keywordId, records);
  }
  const segments: RecordedPlotSegment[] = [];
  let gaps = 0;
  let boundaries = 0;
  for (const [target, records] of targets) {
    const ordered = [...records].sort(
      (a, b) =>
        (historyRecordTime(a, page.window.basis) ?? Infinity) -
          (historyRecordTime(b, page.window.basis) ?? Infinity) || a.id.localeCompare(b.id),
    );
    let segment: RecordedPlotSegment | null = null;
    let digest: string | null = null;
    for (const observation of ordered) {
      const at = historyRecordTime(observation, page.window.basis);
      if (
        observation.evidence !== "positive" ||
        observation.position === null ||
        observation.position <= 0 ||
        !Number.isInteger(observation.position) ||
        at === null ||
        observation.comparisonDigest === null
      ) {
        gaps++;
        segment = null;
        continue;
      }
      if (digest !== observation.comparisonDigest || segment === null) {
        if (digest !== null && digest !== observation.comparisonDigest) boundaries++;
        segment = { key: `${target}:${observation.id}`, points: [] };
        segments.push(segment);
      }
      digest = observation.comparisonDigest;
      segment.points.push({ at, observation, position: observation.position });
    }
  }
  return { segments, gaps, boundaries };
}

export function observationKernelMovement(
  page: ObservationHistoryPage,
  observation: RankReportObservation,
) {
  const resolution = page.resolutions.find(
    (entry) => entry.keywordId === observation.keywordId && entry.current?.id === observation.id,
  );
  if (!resolution) return null;
  return {
    baseline: resolution.baseline,
    event: resolution.event,
    movement:
      resolution.comparison === "comparable" &&
      resolution.current?.evidence === "positive" &&
      resolution.baseline?.evidence === "positive"
        ? resolution.movement
        : null,
  };
}
