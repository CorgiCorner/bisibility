/**
 * Neutral denial for a paid operation that is unavailable for a project.
 * The message and the class carry no billing vocabulary; every surface maps
 * this to its own neutral refusal.
 */
export class OperationAccessDeniedError extends Error {
  constructor() {
    super("This operation is unavailable for this project.");
    this.name = "OperationAccessDeniedError";
  }
}

export function isOperationAccessDeniedError(error: unknown): error is OperationAccessDeniedError {
  return error instanceof OperationAccessDeniedError;
}
