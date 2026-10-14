import { historyRecordTime } from "./history-chart-model";
import type {
  HistoryPage,
  HistoryPages,
  HistoryWindow,
  ObservationHistoryPage,
  RetainedHistorySnapshot,
} from "./history-contract";

function sameWindow(a: HistoryWindow, b: HistoryWindow) {
  return a.basis === b.basis && a.from === b.from && a.to === b.to;
}
function binding(page: HistoryPage) {
  return JSON.stringify({
    asOf: page.asOf,
    definition: page.definitionVersion,
    project: page.projectId,
    selection: page.summary.selectionDigest,
    source: page.sourceDigest,
    window: page.window,
  });
}

export function validHistoryPages(pages: HistoryPages): boolean {
  return (
    pages.observations.stream === "observations" &&
    pages.attempts.stream === "attempts" &&
    pages.attempts.window.basis === "recorded_at" &&
    binding({
      ...pages.observations,
      window: { ...pages.observations.window, basis: "recorded_at" },
    }) === binding(pages.attempts) &&
    validRecords(pages.observations) &&
    validRecords(pages.attempts) &&
    initialComplete(pages.observations) &&
    initialComplete(pages.attempts)
  );
}

function initialComplete(page: HistoryPage) {
  return page.nextCursor === null
    ? page.records.length === page.totalCount
    : page.records.length < page.totalCount;
}

function validRecords(page: HistoryPage) {
  if (
    page.totalCount < page.records.length ||
    !Number.isSafeInteger(page.totalCount) ||
    page.totalCount < 0
  )
    return false;
  if (new Set(page.records.map(({ id }) => id)).size !== page.records.length) return false;
  const from = Date.parse(page.window.from),
    to = Date.parse(page.window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return false;
  return page.records.every((record) => {
    const at = historyRecordTime(record, page.window.basis);
    return (
      at !== null &&
      at >= from &&
      at <= to &&
      (page.stream === "observations" ? "evidence" in record : "kind" in record)
    );
  });
}

/** Changed snapshot, replayed cursor or duplicates refuse the append, never silently deduplicate. */
export function appendHistoryPage(
  current: HistoryPage,
  incoming: HistoryPage,
  requestedCursor: string,
): HistoryPage | null {
  if (
    current.stream !== incoming.stream ||
    current.nextCursor !== requestedCursor ||
    incoming.nextCursor === requestedCursor ||
    binding(current) !== binding(incoming) ||
    current.totalCount !== incoming.totalCount ||
    current.excludedUnknownTime !== incoming.excludedUnknownTime ||
    !validRecords(incoming)
  )
    return null;
  if (JSON.stringify(current.summary) !== JSON.stringify(incoming.summary)) return null;
  const ids = new Set(current.records.map(({ id }) => id));
  if (
    incoming.records.some(({ id }) => ids.has(id)) ||
    current.records.length + incoming.records.length > current.totalCount
  )
    return null;
  if (
    incoming.records.length === 0 ||
    (incoming.nextCursor === null) !==
      (current.records.length + incoming.records.length === current.totalCount)
  )
    return null;
  const resolutions = new Map(
    current.resolutions.map((resolution) => [resolution.keywordId, resolution]),
  );
  for (const resolution of incoming.resolutions) {
    const existing = resolutions.get(resolution.keywordId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(resolution)) return null;
    resolutions.set(resolution.keywordId, resolution);
  }
  if (current.stream === "observations" && incoming.stream === "observations") {
    return {
      ...incoming,
      records: [...current.records, ...incoming.records],
      resolutions: [...resolutions.values()],
    };
  }
  if (current.stream === "attempts" && incoming.stream === "attempts") {
    return {
      ...incoming,
      records: [...current.records, ...incoming.records],
      resolutions: [...resolutions.values()],
    };
  }
  return null;
}

export function historyWindowMatches(page: HistoryPage, window: HistoryWindow) {
  return sameWindow(page.window, window);
}

export function sameHistorySelection(a: HistoryPage, b: HistoryPage): boolean {
  return a.projectId === b.projectId && a.summary.selectionDigest === b.summary.selectionDigest;
}

/** Snapshot content cannot replace the clicked normalized observation with another check or scope. */
export function validHistorySnapshot(
  page: ObservationHistoryPage,
  checkId: string,
  snapshot: RetainedHistorySnapshot,
): boolean {
  const observation = page.records.find((record) => record.id === checkId);
  if (
    !observation ||
    snapshot.asOf !== page.asOf ||
    snapshot.projectId !== page.projectId ||
    JSON.stringify(snapshot.observation) !== JSON.stringify(observation)
  )
    return false;
  const asOf = Date.parse(snapshot.asOf);
  if (
    !Number.isFinite(asOf) ||
    snapshot.items.some(
      (item) =>
        item.checkId !== checkId ||
        item.keywordId !== observation.keywordId ||
        !Number.isFinite(Date.parse(item.recordedAt)) ||
        Date.parse(item.recordedAt) > asOf,
    )
  )
    return false;
  const ids = new Set(snapshot.items.map(({ id }) => id));
  if (ids.size !== snapshot.items.length) return false;
  const identity =
    observation.configuredScope?.identityRevision ??
    observation.effectiveScope?.identityRevision ??
    null;
  return (snapshot.featureFacts ?? []).every(
    (fact) =>
      fact.checkId === checkId &&
      fact.sourceItemIds.every(
        (id) =>
          ids.has(id) && snapshot.items.find((item) => item.id === id)?.resultKind === fact.feature,
      ) &&
      (fact.presence !== "present" || fact.sourceItemIds.length > 0) &&
      (fact.ownership === "unknown" ||
        (fact.presence === "present" && identity !== null && fact.identityRevision === identity)),
  );
}
