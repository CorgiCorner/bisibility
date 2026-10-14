export class OriginalSubmitProofConflictError extends Error {
  constructor() {
    super("Retained original submit proof conflicts with custody.");
    this.name = "OriginalSubmitProofConflictError";
  }
}
export class OriginalSubmitProofUnavailableError extends Error {
  readonly reason = "missing_original_submit_evidence";
  constructor() {
    super("Original exhaustive submit evidence is unavailable.");
    this.name = "OriginalSubmitProofUnavailableError";
  }
}
export class OriginalSubmitProofWriteError extends Error {
  constructor() {
    super("Original submit diagnostic persistence failed.");
    this.name = "OriginalSubmitProofWriteError";
  }
}
/** Preserve binding/constraint failures even when Prisma wraps the PostgreSQL diagnostic. */
export function originalProofStorageConflict(cause: unknown, depth = 0): boolean {
  if (depth > 6 || cause === null || typeof cause !== "object") return false;
  const value = cause as Record<string, unknown>;
  const conflicts = ["23502", "23503", "23505", "23514", "P2002", "P2003", "P2004", "P2011"];
  if (
    [value.code, value.originalCode].some(
      (code) => typeof code === "string" && conflicts.includes(code),
    )
  )
    return true;
  return [value.cause, value.meta, value.driverAdapterError].some((nested) =>
    originalProofStorageConflict(nested, depth + 1),
  );
}
