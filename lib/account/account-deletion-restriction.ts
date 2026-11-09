/** An account extension requires a preparatory action before permanent deletion. */
export class AccountDeletionRestrictedError extends Error {
  readonly code = "account_action_required";
  constructor() {
    super("Complete the required account action before deletion.");
    this.name = "AccountDeletionRestrictedError";
  }
}
