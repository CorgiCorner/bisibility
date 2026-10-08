import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import type { ProviderCredentials, SerpRankInput } from "@/lib/providers/types";
import { ProviderUsagePersistenceError, readObservedResponse } from "@/lib/providers/usage";
import type { SerpApiResponse } from "./serpapi-payload";
import { serpApiUsageReceipt } from "./usage-receipts";

const SEARCH_URL = "https://serpapi.com/search.json";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
// Ten pages fit within the 15-minute activity with 2.5 minutes for persistence.
export const SERP_API_SEARCH_TIMEOUT_MS = 75_000;
const RETRY_BASE_MS = 200;

export class SerpApiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

export function requireApiKey(creds: ProviderCredentials) {
  if (!creds.apiKey) {
    throw new SerpApiError("SerpApi requires an API key credential.");
  }

  return creds.apiKey;
}

function redactedMessage(message: string, creds: ProviderCredentials) {
  const values = [creds.apiKey, creds.login, creds.password]
    .filter((value): value is string => Boolean(value && value.length >= 3))
    .sort((a, b) => b.length - a.length);

  return values.reduce((safe, value) => safe.split(value).join("[redacted]"), message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number) {
  return RETRY_BASE_MS * 2 ** attempt;
}

async function observedAttempt(url: string, creds: ProviderCredentials, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const search = url.startsWith(SEARCH_URL);
  try {
    // Keep the deadline armed until the body and its receipt have been consumed.
    const result = await readObservedResponse<SerpApiResponse>({
      observer: search ? creds.usageObserver : undefined,
      request: () => fetch(url, { signal: controller.signal }),
      measure: serpApiUsageReceipt,
      requireMeasuredUsage: search,
    });
    if (!search && result.data === null)
      throw new SerpApiError("SerpApi response could not be read.");
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function safeErrorMessage(data: SerpApiResponse | null, fallback: string) {
  return typeof data?.error === "string" && data.error.trim() ? data.error : fallback;
}

function readResponse(
  response: Response,
  data: SerpApiResponse | null,
  creds: ProviderCredentials,
  canRetry: boolean,
) {
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const message = safeErrorMessage(data, `SerpApi request failed with HTTP ${response.status}.`);

    throw new SerpApiError(redactedMessage(message, creds), retryable && canRetry);
  }

  if (data && typeof data.error === "string" && data.error.trim()) {
    const retryable = /rate limit|throttl|temporar|try again/i.test(data.error);
    throw new SerpApiError(redactedMessage(data.error, creds), retryable && canRetry);
  }

  return data ?? {};
}

function providerError(error: unknown, creds: ProviderCredentials) {
  if (error instanceof SerpApiError) {
    return error;
  }

  const message =
    error instanceof Error && error.name === "AbortError"
      ? "SerpApi request timed out."
      : "SerpApi request failed.";

  return new SerpApiError(redactedMessage(message, creds), error instanceof TypeError);
}

export async function requestJson(
  url: string,
  creds: ProviderCredentials,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxAttempts = MAX_ATTEMPTS,
): Promise<SerpApiResponse> {
  let lastError: SerpApiError | null = null;
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw lastError ?? new SerpApiError("SerpApi request timed out.");
      const { response, data } = await observedAttempt(url, creds, remaining);
      return readResponse(
        response,
        data,
        creds,
        !url.startsWith(SEARCH_URL) || serpApiUsageReceipt(data, response).quantity === 0,
      );
    } catch (error) {
      if (error instanceof DeploymentAdmissionExhaustedError) throw error;
      if (error instanceof ProviderUsagePersistenceError) throw error;
      // A transport rejection cannot prove the search was uncharged, even without a journal.
      if (url.startsWith(SEARCH_URL) && !(error instanceof SerpApiError))
        throw new ProviderUsagePersistenceError({ cause: error, phase: "request" });
      lastError = providerError(error, creds);
      if (!lastError.retryable || attempt === maxAttempts - 1) {
        throw lastError;
      }
      await wait(retryDelay(attempt));
    }
  }

  throw lastError ?? new SerpApiError("SerpApi request failed.");
}

export function buildSearchUrl(
  input: SerpRankInput,
  apiKey: string,
  googleParams: { gl: string; hl: string; location: string },
  start: number,
) {
  const params = new URLSearchParams({
    api_key: apiKey,
    device: input.device,
    engine: "google",
    ...googleParams,
    q: input.keyword,
    nfpr: "1",
  });
  if (start > 0) {
    params.set("start", String(start));
  }
  return `${SEARCH_URL}?${params.toString()}`;
}
