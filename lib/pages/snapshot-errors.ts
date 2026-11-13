export class PageSnapshotConflictError extends Error {
  constructor() {
    super("A Day 1 snapshot was saved at the same time.");
    this.name = "PageSnapshotConflictError";
  }
}
