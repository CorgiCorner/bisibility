import { ProviderCallError } from "@/lib/providers/call-error";
import type { ProviderCredentials } from "@/lib/providers/types";

export type DataForSeoStatusDetails = { statusCode?: number; statusMessage?: string };

export class DataForSeoError extends ProviderCallError {
  /** Provider envelope `status_code`, when the response carried one. */
  readonly statusCode?: number;
  /** Provider envelope `status_message`, already redacted by the caller. */
  readonly statusMessage?: string;

  constructor(
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    costCents: number | null = null,
    details: DataForSeoStatusDetails = {},
  ) {
    super(message, costCents);
    this.name = "DataForSeoError";
    if (details.statusCode !== undefined) this.statusCode = details.statusCode;
    if (details.statusMessage !== undefined) this.statusMessage = details.statusMessage;
  }
}

export class DataForSeoAccountVerificationError extends DataForSeoError {
  constructor(costCents: number | null) {
    super(
      "Verify your DataForSEO account in the provider dashboard before using the API.",
      false,
      undefined,
      costCents,
    );
    this.code = "provider_account_restricted";
    this.name = "DataForSeoAccountVerificationError";
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
    super(message, costCents, "provider_billing");
    this.name = "DataForSeoBillingError";
  }
}

export class DataForSeoValidationError extends ProviderCallError {
  readonly charged: boolean;

  constructor(message: string, costCents: number | null = null) {
    super(message, costCents);
    this.name = "DataForSeoValidationError";
    this.charged = costCents !== null && costCents > 0;
  }
}

function credentialForms(credentials: ProviderCredentials) {
  const raw = [credentials.login, credentials.password, credentials.apiKey].filter(
    (value): value is string => Boolean(value && value.length >= 3),
  );
  const forms = new Set<string>();
  for (const value of raw) {
    forms.add(value);
    forms.add(encodeURIComponent(value));
  }
  if (credentials.login && credentials.password) {
    // A provider or proxy may echo the Basic Authorization value in its error text.
    const pair = `${credentials.login}:${credentials.password}`;
    forms.add(pair);
    forms.add(Buffer.from(pair).toString("base64"));
  }
  return [...forms].filter((value) => value.length >= 3).sort((a, b) => b.length - a.length);
}

/** Removes credentials, their URL-encoded forms and the Basic Authorization value from text. */
export function redactedMessage(message: string, credentials: ProviderCredentials) {
  return credentialForms(credentials)
    .reduce((safe, value) => safe.split(value).join("[redacted]"), message)
    .replace(/(authorization["']?\s*[:=]\s*["']?(?:basic|bearer)\s+)[^\s"',;]+/gi, "$1[redacted]");
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

export function noSearchResults(statusCode: number | undefined, message: string) {
  return (statusCode === 40102 || statusCode === 40501) && /no search results/i.test(message);
}

export function unsupportedLabsRequest(statusCode: number | undefined, message: string) {
  const unsupportedLocation =
    /(?:location|target).*(?:invalid|not found|not supported|unsupported)|(?:invalid field|unsupported).*(?:location|target)/i.test(
      message,
    );
  const unsupportedLanguage =
    statusCode === 40501 && /invalid field:\s*['"]language_(?:code|name)['"]/i.test(message);
  return unsupportedLocation || unsupportedLanguage;
}

const STATUS_MESSAGE_LIMIT = 200;

/** A provider `status_message` that is safe to store and log: redacted first, then bounded. */
export function safeDataForSeoStatusMessage(value: unknown, credentials: ProviderCredentials) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return redactedMessage(value.trim(), credentials).slice(0, STATUS_MESSAGE_LIMIT);
}

/** A definite HTTP rejection of a task submission, keeping the provider status fields. */
export function dataForSeoSubmissionRejection(
  httpStatus: number,
  body: { status_code?: unknown; status_message?: unknown } | null,
  credentials: ProviderCredentials,
) {
  const statusCode = typeof body?.status_code === "number" ? body.status_code : undefined;
  const statusMessage = safeDataForSeoStatusMessage(body?.status_message, credentials);
  const status = statusCode === undefined ? "" : `, status ${statusCode}`;
  return new DataForSeoError(
    `DataForSEO task submission failed with HTTP ${httpStatus}${status}: ${(statusMessage ?? "no status message").replace(/\.+$/, "")}.`,
    httpStatus === 429,
    httpStatus,
    null,
    { statusCode, statusMessage },
  );
}
