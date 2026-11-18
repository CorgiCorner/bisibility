import { APICallError } from "@ai-sdk/provider";
import { object } from "./provider-types";
import type { AssistantProvider } from "./wire";

/**
 * Why a provider refused a key before running the request. Only these let a platform-key call
 * move to the next key: the provider ran nothing, so a new attempt cannot double-charge.
 */
export type KeyRejection = "invalid_key" | "no_permission" | "quota_exhausted";

/** OpenAI 429 codes that mean billing or quota, not request rate (OpenAI error-codes guide). */
const OPENAI_QUOTA_CODES: ReadonlySet<string> = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

type ErrorBody = { type?: string; code?: string; message?: string };

/** The `error` object the providers return: `{ type, code?, message }`. Read, never stored. */
function errorBody(error: APICallError): ErrorBody {
  let data: unknown = error.data;
  if (data === undefined && error.responseBody) {
    try {
      data = JSON.parse(error.responseBody);
    } catch {
      data = undefined;
    }
  }
  const inner = object(object(data).error);
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return { type: text(inner.type), code: text(inner.code), message: text(inner.message) };
}

function quotaExhausted(provider: AssistantProvider, status: number, body: ErrorBody) {
  if (provider === "openai")
    return (
      status === 429 &&
      (OPENAI_QUOTA_CODES.has(body.code ?? "") || body.type === "insufficient_quota")
    );
  // OpenRouter: 402 means the key or account has no credits left.
  if (provider === "openrouter") return status === 402;
  // Anthropic: 402 billing_error, or a 400 for a low credit balance or a reached spend limit.
  if (status === 402) return true;
  return (
    status === 400 &&
    body.type === "invalid_request_error" &&
    /credit balance|spend limit/i.test(body.message ?? "")
  );
}

/**
 * Classifies a provider's HTTP refusal of the request itself. Anything else (timeouts, network
 * errors, 5xx, a plain rate limit, errors inside an opened stream) returns null. The caller must
 * also know that nothing was received: this looks at the error only.
 */
export function keyRejectionOf(error: unknown, provider: AssistantProvider): KeyRejection | null {
  if (!APICallError.isInstance(error) || error.statusCode === undefined) return null;
  if (error.statusCode === 401) return "invalid_key";
  if (error.statusCode === 403) return "no_permission";
  return quotaExhausted(provider, error.statusCode, errorBody(error)) ? "quota_exhausted" : null;
}
