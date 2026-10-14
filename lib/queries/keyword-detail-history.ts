import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { projectKeywordDetailQuality } from "@/lib/keyword-detail/quality-projector";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import {
  RankReportCapacityError,
  RankReportCursorError,
  RankReportSelectionError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import type {
  HistoryPage,
  HistoryPages,
  HistoryRead,
  HistoryWindow,
  RetainedHistorySnapshot,
} from "@/lib/rank-reports/history-contract";
import { readRetainedHistorySnapshotFor } from "@/lib/rank-reports/history-snapshot";
import { hostRankReportCursorCodec } from "@/lib/rank-reports/host-cursor";
import {
  type RankReportReadOptions,
  readRankReportFor,
  readRankReportPagesFor,
  readRankReportPagesWithProjectionFor,
} from "@/lib/rank-reports/service";
import { projectKeywordDetailReportMetadata } from "./keyword-detail-report-metadata";
import type { RankTrackerReportMetadata } from "./rank-tracker-report-model";
import { createSessionRankTrackerReportOptions } from "./rank-tracker-session-report";

export type KeywordHistoryScope = {
  projectId: string;
  keywordId: string;
  windows: readonly { id: string; window: HistoryWindow }[];
};

function registeredWindow(scope: KeywordHistoryScope, input: HistoryWindow): HistoryWindow {
  const window = scope.windows.find(
    ({ window }) =>
      window.from === input.from && window.to === input.to && window.basis === input.basis,
  )?.window;
  if (!window) throw new RankReportCursorError();
  return { ...window };
}
async function sessionOptions(asOf = new Date()) {
  // A new server action renews the real session; the report DAL renews membership within its transaction.
  const report = await createSessionRankTrackerReportOptions(asOf);
  if (!report.context) throw new AuthorizationError("unauthenticated");
  const options: RankReportReadOptions = {
    cursor: hostRankReportCursorCodec(),
    firstAsOf: report.asOf,
    limits: report.limits,
    policyAt: report.policyAt,
    loadMetadata: (tx, scope, at) => report.loadMetadata(tx, scope.project, scope.keywords, at),
  };
  return { context: report.context, options, report };
}
function request(
  scope: KeywordHistoryScope,
  window: HistoryWindow,
  stream: HistoryPage["stream"],
  cursor?: string,
) {
  return {
    projectId: scope.projectId,
    selectedIds: [scope.keywordId],
    pageLimit: 100,
    stream,
    window: stream === "attempts" ? { ...window, basis: "recorded_at" } : window,
    ...(cursor ? { cursor } : {}),
  };
}
export async function loadKeywordHistoryWindow(
  scope: KeywordHistoryScope,
  window: HistoryWindow,
): Promise<HistoryPages> {
  const selected = registeredWindow(scope, window);
  const { context, options } = await sessionOptions(new Date(selected.to));
  const pages = await readRankReportPagesFor(
    context,
    [request(scope, selected, "observations"), request(scope, selected, "attempts")],
    options,
  );
  const [observations, attempts] = pages;
  if (observations.stream !== "observations" || attempts.stream !== "attempts")
    throw new RankReportSnapshotConflictError();
  // The server selected each stream. The shared reader's union is narrowed here, not trusted from client data.
  return { observations, attempts } as HistoryPages;
}
/** Header and initial history use one snapshot; the supplied row contributes no rank evidence. */
export async function loadKeywordDetailHistoryWindow<T extends KeywordRow>(
  scope: KeywordHistoryScope,
  window: HistoryWindow,
  row: T,
) {
  const selected = registeredWindow(scope, window);
  if (row.id !== scope.keywordId) throw new RankReportSelectionError();
  // The initial current/header watermark is exactly the server-registered calendar window end.
  const { context, options, report } = await sessionOptions(new Date(selected.to));
  const captured: { metadata: ReadonlyMap<string, RankTrackerReportMetadata> | null } = {
    metadata: null,
  };
  const pairedOptions: RankReportReadOptions = {
    ...options,
    loadMetadata: async (tx, authorized, at) => {
      const metadata = await report.loadMetadata(tx, authorized.project, authorized.keywords, at);
      if (captured.metadata === null) captured.metadata = structuredClone(metadata);
      return metadata;
    },
  };
  const result = await readRankReportPagesWithProjectionFor(
    context,
    [request(scope, selected, "observations"), request(scope, selected, "attempts")],
    pairedOptions,
    (snapshot) => {
      if (captured.metadata === null) throw new RankReportSnapshotConflictError();
      const capturedRow = projectKeywordDetailReportMetadata(row, captured.metadata.get(row.id));
      return projectKeywordDetailQuality(
        capturedRow,
        snapshot.targets,
        snapshot.policy,
        snapshot.project.id,
        snapshot.sourceDigest,
      );
    },
  );
  const [observations, attempts] = result.pages;
  if (observations.stream !== "observations" || attempts.stream !== "attempts")
    throw new RankReportSnapshotConflictError();
  return {
    history: { observations, attempts } as HistoryPages,
    quality: result.projection.quality,
    keyword: { ...row, ...result.projection.row },
  };
}
export async function loadKeywordHistoryPage(
  scope: KeywordHistoryScope,
  input: { cursor: string; stream: HistoryPage["stream"]; window: HistoryWindow },
): Promise<HistoryRead<HistoryPage>> {
  return historyRead(async () => {
    if (input.stream !== "observations" && input.stream !== "attempts")
      throw new RankReportCursorError();
    const selected = registeredWindow(scope, { ...input.window, basis: "observed_at" });
    if (input.window.basis !== (input.stream === "attempts" ? "recorded_at" : "observed_at"))
      throw new RankReportCursorError();
    const { context, options } = await sessionOptions();
    return (await readRankReportFor(
      context,
      request(scope, selected, input.stream, input.cursor),
      options,
    )) as HistoryPage;
  });
}
export function refreshKeywordHistoryWindow(
  scope: KeywordHistoryScope,
  window: HistoryWindow,
): Promise<HistoryRead<HistoryPages>> {
  return historyRead(() => loadKeywordHistoryWindow(scope, window));
}
export function loadKeywordHistorySnapshot(
  scope: KeywordHistoryScope,
  input: { asOf: string; checkId: string },
): Promise<HistoryRead<RetainedHistorySnapshot>> {
  return historyRead(async () => {
    const { context, options } = await sessionOptions();
    return readRetainedHistorySnapshotFor(
      context,
      { ...input, projectId: scope.projectId, keywordId: scope.keywordId },
      options,
    );
  });
}
async function historyRead<T>(read: () => Promise<T>): Promise<HistoryRead<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof RankReportSelectionError)
      return { ok: false, reason: "forbidden" };
    if (error instanceof RankReportCapacityError) return { ok: false, reason: "capacity" };
    if (error instanceof RankReportSnapshotConflictError)
      return { ok: false, reason: "snapshot_conflict" };
    // Preserve framework redirects rather than translating a missing session into a read failure.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_")
    )
      throw error;
    return { ok: false, reason: "unavailable" };
  }
}
