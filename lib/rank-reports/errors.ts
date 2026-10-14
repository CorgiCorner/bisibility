export class RankReportCursorError extends Error {
  readonly code = "invalid_rank_report_cursor";
  readonly status = 400;
  constructor() {
    super("This report cursor is invalid for the requested scope.");
  }
}
export class RankReportSnapshotConflictError extends Error {
  readonly code = "rank_report_snapshot_changed";
  readonly status = 409;
  constructor() {
    super("This report changed. Start a new report snapshot.");
  }
}
export class RankReportSelectionError extends Error {
  readonly code = "rank_report_selection_unavailable";
  readonly status = 404;
  constructor() {
    super("The selected report scope is unavailable.");
  }
}
export class RankReportCapacityError extends Error {
  readonly code = "rank_report_capacity_exceeded";
  readonly status = 413;
  constructor() {
    super("Narrow the selected report scope or use a larger authorized read budget.");
  }
}
