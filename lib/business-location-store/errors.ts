export class BusinessLocationUnavailableError extends Error {
  readonly code = "business_location_unavailable";
  readonly status = 404;
  constructor() {
    super("Business location or retained observation is unavailable.");
    this.name = "BusinessLocationUnavailableError";
  }
}
export type BusinessConflictReason =
  | "revision_conflict"
  | "state_conflict"
  | "idempotency_conflict"
  | "identifier_claimed"
  | "review_cursor_conflict";
export class BusinessLocationConflictError extends Error {
  readonly code = "business_location_conflict";
  readonly status = 409;
  constructor(readonly reason: BusinessConflictReason = "revision_conflict") {
    super("Business location state changed. Review the current revision.");
    this.name = "BusinessLocationConflictError";
  }
}
export class BusinessObservationUnavailableError extends Error {
  readonly code = "business_observation_evidence_unavailable";
  readonly status = 422;
  constructor(
    readonly reason:
      | "missing_observed_at"
      | "missing_adapter_version"
      | "unsupported_surface"
      | "invalid_retained_evidence",
  ) {
    super("Original retained observation evidence is unavailable.");
    this.name = "BusinessObservationUnavailableError";
  }
}
