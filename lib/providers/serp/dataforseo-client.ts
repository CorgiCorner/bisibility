import { ProviderAuthError } from "@/lib/providers/auth-error";
import type { ProviderCredentials } from "@/lib/providers/types";
import type { SerpRankLocation } from "@/lib/serp/location";
import { countryDegradedResearchLocation } from "@/lib/serp/market-capability";
import { resolveSerpDepth } from "@/lib/serp/markets";
import { DataForSeoError, redactedMessage } from "./dataforseo-errors";
import { type DataForSeoResponse, dataForSeoResponseCostCents } from "./dataforseo-payload";

export const DATA_FOR_SEO_OK_STATUS = 20000;

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_RETRIES = 1;
const RETRY_BASE_MS = 200;

export function requireDataForSeoLogin(creds: ProviderCredentials) {
  if (!creds.login || !creds.password) {
    throw new ProviderAuthError(
      "dataforseo",
      "DataForSEO requires login and password credentials. Reconnect the account.",
    );
  }

  const userInfo = `${creds.login}:${creds.password}`;
  return `Basic ${Buffer.from(userInfo).toString("base64")}`;
}

// Numeric location_code is stable/unambiguous, so prefer it; location_name is the
// documented fallback. language_code comes from the pre-resolved hl handle (design §2.3).
export function dataForSeoGoogleParams(input: { depth?: number; location: SerpRankLocation }) {
  const { location } = input;
  const geo =
    location.primaryGeoCode !== null
      ? { location_code: location.primaryGeoCode }
      : { location_name: location.primaryGeoName };
  return {
    depth: resolveSerpDepth(input.depth),
    language_code: location.hl,
    ...geo,
  };
}

export function dataForSeoLabsLocationParams(location: SerpRankLocation) {
  const { depth: _depth, ...params } = dataForSeoGoogleParams({
    location: countryDegradedResearchLocation(location),
  });
  return params;
}

function safeStatusMessage(data: DataForSeoResponse | null, fallback: string) {
  return typeof data?.status_message === "string" && data.status_message.trim()
    ? data.status_message
    : fallback;
}

async function readResponse(response: Response, creds: ProviderCredentials) {
  let data: DataForSeoResponse | null = null;

  try {
    data = (await response.json()) as DataForSeoResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const message = safeStatusMessage(
      data,
      `DataForSEO request failed with HTTP ${response.status}.`,
    );

    throw new DataForSeoError(
      redactedMessage(message, creds),
      retryable,
      response.status,
      data ? dataForSeoResponseCostCents(data) : null,
    );
  }

  return data ?? {};
}

function retryableStatusCode(statusCode: number | undefined) {
  return typeof statusCode === "number" && statusCode >= 50000;
}

export function envelopeRetryable(data: DataForSeoResponse) {
  return (
    retryableStatusCode(data.status_code) ||
    (data.tasks?.some((task) => retryableStatusCode(task.status_code)) ?? false)
  );
}

export function envelopeOk(data: DataForSeoResponse) {
  return (
    data.status_code === DATA_FOR_SEO_OK_STATUS &&
    (data.tasks ?? []).every((task) => task.status_code === DATA_FOR_SEO_OK_STATUS)
  );
}

export function envelopeMessage(data: DataForSeoResponse) {
  return (
    data.tasks?.find((task) => task.status_code !== DATA_FOR_SEO_OK_STATUS)?.status_message ??
    data.status_message ??
    "DataForSEO SERP request failed."
  );
}

function retryDelay(attempt: number) {
  return RETRY_BASE_MS * 2 ** attempt;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function providerError(error: unknown, creds: ProviderCredentials) {
  if (error instanceof DataForSeoError) return error;
  const timedOut = error instanceof Error && error.name === "AbortError";
  return new DataForSeoError(
    redactedMessage(
      timedOut ? "DataForSEO request timed out." : "DataForSEO request failed.",
      creds,
    ),
    error instanceof TypeError,
  );
}

export async function requestEnvelope(
  url: string,
  init: RequestInit,
  creds: ProviderCredentials,
  timeoutMs?: number,
) {
  let lastError: DataForSeoError | null = null;
  let timeoutRetries = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const data = await readResponse(await fetchWithTimeout(url, init, timeoutMs), creds);

      if (envelopeRetryable(data) && attempt < MAX_ATTEMPTS - 1) {
        await wait(retryDelay(attempt));
        continue;
      }

      return data;
    } catch (error) {
      // Timeouts (AbortError) are retried at most once so the fallback chain keeps headroom.
      const timedOut = error instanceof Error && error.name === "AbortError";
      lastError = providerError(error, creds);
      const canRetry = timedOut ? timeoutRetries++ < MAX_TIMEOUT_RETRIES : lastError.retryable;
      if (!canRetry || attempt === MAX_ATTEMPTS - 1) {
        throw lastError;
      }
      await wait(retryDelay(attempt));
    }
  }

  throw lastError ?? new DataForSeoError("DataForSEO request failed.");
}

export async function requestAuthenticatedEnvelope(
  url: string,
  credentials: ProviderCredentials,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", requireDataForSeoLogin(credentials));
  try {
    return await requestEnvelope(url, { ...init, headers }, credentials);
  } catch (error) {
    if (error instanceof ProviderAuthError) throw error;
    if (error instanceof DataForSeoError && error.httpStatus === 401) {
      throw new ProviderAuthError("dataforseo");
    }
    throw error;
  }
}

export function extractDataForSeoBalance(data: unknown) {
  const tasks = (data as { tasks?: Array<{ result?: unknown[] }> }).tasks ?? [];
  const firstResult = tasks[0]?.result?.[0] as Record<string, unknown> | undefined;
  const balance =
    firstResult?.balance ?? firstResult?.money ?? (data as Record<string, unknown>).balance;

  return typeof balance === "number" ? balance : undefined;
}
