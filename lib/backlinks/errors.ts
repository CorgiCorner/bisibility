export class BacklinksSnapshotExpiredError extends Error {
  readonly code = "snapshot_expired";
  constructor() {
    super("The backlinks snapshot changed or cannot be extended. Open the report again.");
    this.name = "BacklinksSnapshotExpiredError";
  }
}
