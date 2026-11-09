/**
 * Neutral denial for a paid operation that is unavailable for a project.
 * Every surface maps the optional paid-access requirement to its own refusal.
 */
export class OperationAccessDeniedError extends Error {
  readonly subscriptionRequired: boolean;

  constructor(options: { subscriptionRequired?: boolean } = {}) {
    super("This operation is unavailable for this project.");
    this.name = "OperationAccessDeniedError";
    this.subscriptionRequired = options.subscriptionRequired === true;
  }
}

export function isOperationAccessDeniedError(error: unknown): error is OperationAccessDeniedError {
  return error instanceof OperationAccessDeniedError;
}
