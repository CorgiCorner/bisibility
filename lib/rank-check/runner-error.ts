export type RankCheckRunnerErrorCode =
  | "keyword_not_found"
  | "no_provider_connected"
  | "credentials_unavailable"
  | "provider_rate_limited"
  | "provider_failed";

export class RankCheckRunnerError extends Error {
  /** Settled charge of the failed request; a positive value forbids provider fallback. */
  readonly chargedCents: number | null;

  constructor(
    readonly code: RankCheckRunnerErrorCode,
    message: string,
    options?: ErrorOptions & { chargedCents?: number | null },
  ) {
    super(message, options);
    this.name = "RankCheckRunnerError";
    const inherited =
      options?.cause instanceof RankCheckRunnerError ? options.cause.chargedCents : null;
    this.chargedCents =
      inherited !== null && inherited > (options?.chargedCents ?? 0)
        ? inherited
        : (options?.chargedCents ?? inherited);
  }
}
