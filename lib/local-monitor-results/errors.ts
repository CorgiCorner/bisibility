export class LocalResultSelectionError extends Error {
  readonly reason = "invalid_selection";
  constructor() {
    super("The Local result time selection is invalid.");
  }
}
export class LocalResultUnavailableError extends Error {
  readonly reason = "unavailable";
  constructor() {
    super("The retained Local result is unavailable.");
  }
}
export class LocalResultSnapshotConflictError extends Error {
  readonly reason = "source_conflict";
  constructor() {
    super("The retained Local result snapshot changed.");
  }
}
export class LocalResultCapacityError extends Error {
  readonly reason = "capacity";
  constructor() {
    super("The Local result exceeds the supported read capacity.");
  }
}
