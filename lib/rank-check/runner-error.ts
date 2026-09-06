export type RankCheckRunnerErrorCode =
  | "keyword_not_found"
  | "no_provider_connected"
  | "credentials_unavailable"
  | "provider_rate_limited"
  | "provider_failed";

export class RankCheckRunnerError extends Error {
  constructor(
    readonly code: RankCheckRunnerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RankCheckRunnerError";
  }
}
