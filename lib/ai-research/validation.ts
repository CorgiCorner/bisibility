export class AiResearchValidationError extends Error {
  constructor(
    readonly reason:
      | "pricing_unavailable"
      | "unsupported_model"
      | "unsupported_market"
      | "unsupported_language"
      | "unsupported_web_search"
      | "unsupported_model_options"
      | "model_not_enabled"
      | "web_search_not_enabled"
      | "own_credentials_required"
      | "credentials_changed"
      | "idempotency_conflict"
      | "usage_reconciliation_required"
      | "cost_limit_exceeded",
    message: string,
  ) {
    super(message);
  }
}

export class AiPreDispatchRefusal extends Error {
  constructor(readonly original: unknown) {
    super("Analysis refused before any paid provider dispatch.");
  }
}
