import { ProviderAuthError } from "./auth-error";
import { ProviderRateLimitedError } from "./rate-limit";

export type ProviderFailureClass =
  | "auth"
  | "config_invalid"
  | "rate_limit"
  | "network"
  | "provider_4xx"
  | "provider_5xx"
  | "unknown";

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message = `Provider request failed with status ${status}.`,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

function isInvalidPropertyResponse(error: ProviderHttpError) {
  if (error.status < 400 || error.status >= 500) return false;
  return [
    /\binvalid\s+property(?:\s+(?:id|identifier))?\b/i,
    /\bproperty(?:\s+(?:id|identifier))?\b.{0,80}\b(?:invalid|not found|does not exist)\b/i,
    /\b(?:unable|failed) to parse property(?:\s+(?:id|identifier))?\b/i,
    /\bdid not find (?:a |the )?property\b/i,
  ].some((pattern) => pattern.test(error.message));
}

export function classifyProviderFailure(error: unknown): ProviderFailureClass {
  if (error instanceof ProviderAuthError) return "auth";
  if (error instanceof ProviderConfigurationError) return "config_invalid";
  if (error instanceof ProviderRateLimitedError) return "rate_limit";
  if (error instanceof ProviderHttpError) {
    if (error.status >= 500) return "provider_5xx";
    if (isInvalidPropertyResponse(error)) return "config_invalid";
    if (error.status >= 400) return "provider_4xx";
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
  ) {
    return "network";
  }
  return "unknown";
}
