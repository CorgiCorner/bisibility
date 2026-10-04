/** Project-scoped crawl capacity; no provider request has started when this is thrown. */
export class AuditRateLimitError extends Error {
  readonly code = "site_audit_rate_limited";

  constructor(
    readonly resetAt: number,
    readonly limit: number,
    readonly remaining: number,
  ) {
    super("Site audit rate limit reached. Try again shortly.");
    this.name = "AuditRateLimitError";
  }

  get retryAfterSeconds() {
    return Math.max(1, Math.ceil((this.resetAt - Date.now()) / 1000));
  }
}
