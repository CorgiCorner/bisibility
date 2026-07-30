import { ProviderCallError } from "@/lib/providers/call-error";
import type { ProviderCredentials } from "@/lib/providers/types";

export class DataForSeoError extends ProviderCallError {
  constructor(
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    costCents: number | null = null,
  ) {
    super(message, costCents);
    this.name = "DataForSeoError";
  }
}

export class DataForSeoUnsupportedLocationError extends ProviderCallError {
  constructor(
    message = "DataForSEO does not support this target or location.",
    costCents: number | null = null,
  ) {
    super(message, costCents);
    this.name = "DataForSeoUnsupportedLocationError";
  }
}

export class DataForSeoBillingError extends ProviderCallError {
  constructor(message: string, costCents: number | null = null) {
    super(message, costCents);
    this.name = "DataForSeoBillingError";
  }
}

export class DataForSeoValidationError extends ProviderCallError {
  readonly charged: boolean;

  constructor(message: string, costCents: number | null = null) {
    super(message, costCents);
    this.name = "DataForSeoValidationError";
    this.charged = costCents !== null;
  }
}

export function redactedMessage(message: string, credentials: ProviderCredentials) {
  const values = [credentials.login, credentials.password, credentials.apiKey]
    .filter((value): value is string => Boolean(value && value.length >= 3))
    .sort((a, b) => b.length - a.length);
  return values.reduce((safe, value) => safe.split(value).join("[redacted]"), message);
}

export function messageWithSentParameters(
  message: string,
  payload: Record<string, unknown>,
  credentials: ProviderCredentials,
) {
  return redactedMessage(`${message} Sent parameters: ${JSON.stringify(payload)}.`, credentials);
}

export function validationFailure(message: string) {
  return /invalid field|invalid parameter|validation/i.test(message);
}

export function unsupportedLabsRequest(message: string) {
  return /(?:location|target).*(?:invalid|not found|not supported|unsupported)|(?:invalid field|unsupported).*(?:location|target)/i.test(
    message,
  );
}
