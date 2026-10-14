export class DefinitionUnavailableError extends Error {
  readonly code = "measurement_definition_unavailable";
  constructor() {
    super("Current measurement definition is unavailable.");
  }
}
export class DefinitionConflictError extends Error {
  readonly code = "measurement_definition_conflict";
  readonly status = 409;
  constructor() {
    super("Measurement definition changed before capture or dispatch.");
  }
}
export class DefinitionIntegrityError extends Error {
  readonly code = "measurement_definition_integrity";
  constructor() {
    super("Measurement definition storage invariants are unavailable.");
  }
}
export class DefinitionCapacityError extends Error {
  constructor() {
    super("Measurement definition read budget was exceeded.");
  }
}
