import type { SummaryCheck } from "./aggregate";
export const date = (time: string) => new Date(`2026-10-24T${time}Z`);
export const window = { start: date("06:00:00"), end: date("07:00:00") };
export const thresholds = { topN: 10, positionMove: 5 };
export function check(patch: Partial<SummaryCheck> = {}): SummaryCheck {
  return {
    id: "current",
    keywordId: "keyword",
    keywordPublicId: "kw_public",
    checkedAt: date("06:30:00"),
    finishedAt: date("06:31:00"),
    terminalPersistedAt: date("06:31:00"),
    recoveryRestoredAt: null,
    comparisonAllowed: true,
    normalizationVersion: "v1",
    requestedDepth: 100,
    position: 10,
    status: "completed",
    deferredReason: null,
    raw: null,
    underReview: false,
    incidentIds: [],
    ...patch,
  };
}
