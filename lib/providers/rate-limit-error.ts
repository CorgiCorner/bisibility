export type ProviderRateLimitSource = "local" | "provider";
export type ProviderRateLimitScope = "daily" | "minute" | "unknown";

export class ProviderRateLimitedError extends Error {
  readonly accountKey: string;
  readonly resetAt: number;
  readonly scope: ProviderRateLimitScope;
  readonly source: ProviderRateLimitSource;

  constructor(
    readonly providerId: string,
    options: {
      accountKey?: string;
      message?: string;
      resetAt?: number;
      scope?: ProviderRateLimitScope;
      source?: ProviderRateLimitSource;
    } = {},
  ) {
    super(options.message ?? `Provider ${providerId} is rate limited; deferring.`);
    this.name = "ProviderRateLimitedError";
    this.accountKey = options.accountKey ?? providerId;
    this.resetAt = options.resetAt ?? Date.now() + 60_000;
    this.scope = options.scope ?? "unknown";
    this.source = options.source ?? "local";
  }

  retryAfterSeconds(now = Date.now()) {
    return Math.max(1, Math.ceil((this.resetAt - now) / 1000));
  }
}
