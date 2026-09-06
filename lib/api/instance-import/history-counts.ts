export type HistoryImportCounts = {
  imported: number;
  received: number;
  skipped: number;
  unknownDepth: number;
};

export function historyImportResultCounts(counts: HistoryImportCounts) {
  return {
    history: counts.imported,
    history_received: counts.received,
    history_skipped: counts.skipped,
    ...(counts.unknownDepth > 0 ? { history_unknown_depth: counts.unknownDepth } : {}),
  };
}
