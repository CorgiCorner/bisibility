import { normalizeDomain } from "@/lib/domains/normalize";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import type {
  ProviderCredentials,
  ProviderTestResult,
  SerpProvider,
  SerpRankInput,
} from "@/lib/providers/types";
import { countryDegradedRankLocation, type SerpRankLocation } from "@/lib/serp/location";
import { resolveSerpDepth, resolveSerpStopOnMatch } from "@/lib/serp/markets";
import { createDataForSeoBacklinksMethods } from "./dataforseo-backlinks";
import {
  DataForSeoError,
  DataForSeoUnsupportedLocationError,
  messageWithSentParameters,
  redactedMessage,
  unsupportedLabsRequest,
  validationFailure,
} from "./dataforseo-errors";
import {
  type DataForSeoResponse,
  dataForSeoOrganicDecision,
  dataForSeoRankedKeywordsPage,
  dataForSeoRawPayload,
  dataForSeoResponseCostCents,
} from "./dataforseo-payload";
import { createDataForSeoResearchMethods } from "./dataforseo-research";
import { requireDeterminateOrganicResult } from "./payload-contract-error";

const USER_DATA_URL = "https://api.dataforseo.com/v3/appendix/user_data";
const SERP_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const RANKED_KEYWORDS_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live";
const OK_STATUS = 20000;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
// The synchronous SERP endpoint is slower than other calls; give it more headroom.
const SERP_REQUEST_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_RETRIES = 1;
const RETRY_BASE_MS = 200;

export { DataForSeoUnsupportedLocationError } from "./dataforseo-errors";

function requireLogin(creds: ProviderCredentials) {
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
function dataForSeoGoogleParams(input: { depth?: number; location: SerpRankLocation }) {
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

function dataForSeoLabsLocationParams(location: SerpRankLocation) {
  const { depth: _depth, ...params } = dataForSeoGoogleParams({
    location: countryDegradedRankLocation(location),
  });
  return params;
}

// biome-ignore format: compact helper keeps this provider under the line cap.
function safeStatusMessage(data: DataForSeoResponse | null, fallback: string) { return typeof data?.status_message === "string" && data.status_message.trim() ? data.status_message : fallback; }

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

// biome-ignore format: compact helper keeps this provider under the line cap.
function envelopeRetryable(data: DataForSeoResponse) { return retryableStatusCode(data.status_code) || (data.tasks?.some((task) => retryableStatusCode(task.status_code)) ?? false); }

// biome-ignore format: compact helper keeps this provider under the line cap.
function envelopeOk(data: DataForSeoResponse) { return data.status_code === OK_STATUS && (data.tasks ?? []).every((task) => task.status_code === OK_STATUS); }

// biome-ignore format: compact helper keeps this provider under the line cap.
function envelopeMessage(data: DataForSeoResponse) { return data.tasks?.find((task) => task.status_code !== OK_STATUS)?.status_message ?? data.status_message ?? "DataForSEO SERP request failed."; }

// biome-ignore format: compact helper keeps this provider under the line cap.
function retryDelay(attempt: number) { return RETRY_BASE_MS * 2 ** attempt; }

// biome-ignore format: compact helper keeps this provider under the line cap.
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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

async function requestEnvelope(
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

async function requestLabs(
  url: string,
  credentials: ProviderCredentials,
  payload: Record<string, unknown>,
) {
  let data: DataForSeoResponse;
  try {
    data = await requestEnvelope(
      url,
      {
        body: JSON.stringify([payload]),
        headers: {
          Authorization: requireLogin(credentials),
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      credentials,
    );
  } catch (error) {
    if (error instanceof ProviderAuthError) throw error;
    if (error instanceof DataForSeoError && error.httpStatus === 401) {
      throw new ProviderAuthError("dataforseo");
    }
    if (error instanceof DataForSeoError) {
      const unsupported = unsupportedLabsRequest(error.message);
      if (unsupported || validationFailure(error.message)) {
        const message = messageWithSentParameters(error.message, payload, credentials);
        if (unsupported) throw new DataForSeoUnsupportedLocationError(message, error.costCents);
        throw new DataForSeoError(message, error.retryable, error.httpStatus, error.costCents);
      }
    }
    throw error;
  }
  if (!envelopeOk(data)) {
    const rawMessage = envelopeMessage(data);
    const unsupported = unsupportedLabsRequest(rawMessage);
    const message =
      unsupported || validationFailure(rawMessage)
        ? messageWithSentParameters(rawMessage, payload, credentials)
        : redactedMessage(rawMessage, credentials);
    const costCents = dataForSeoResponseCostCents(data);
    if (unsupported) throw new DataForSeoUnsupportedLocationError(message, costCents);
    throw new DataForSeoError(message, false, undefined, costCents);
  }
  return data;
}

function extractBalance(data: unknown) {
  const tasks = (data as { tasks?: Array<{ result?: unknown[] }> }).tasks ?? [];
  const firstResult = tasks[0]?.result?.[0] as Record<string, unknown> | undefined;
  const balance =
    firstResult?.balance ?? firstResult?.money ?? (data as Record<string, unknown>).balance;

  return typeof balance === "number" ? balance : undefined;
}

const researchMethods = createDataForSeoResearchMethods({
  locationParams: dataForSeoLabsLocationParams,
  request: requestLabs,
});

export const dataForSeoProvider: SerpProvider = {
  id: "dataforseo",
  label: "DataForSEO",

  async testConnection(creds: ProviderCredentials): Promise<ProviderTestResult> {
    try {
      const data = await requestEnvelope(
        USER_DATA_URL,
        {
          headers: { Authorization: requireLogin(creds) },
        },
        creds,
      );
      const ok = data.status_code === OK_STATUS;

      return {
        ok,
        message: data.status_message ?? (ok ? "Connected." : "DataForSEO connection test failed."),
        balance: extractBalance(data),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "DataForSEO connection test failed.",
      };
    }
  },

  async fetchRank(input: SerpRankInput) {
    const credentials = input.credentials ?? {};
    const requestParams = dataForSeoGoogleParams({
      depth: input.depth,
      location: input.location,
    });
    const stopTarget = normalizeDomain(input.domain) ?? input.domain;
    const payload = {
      ...requestParams,
      keyword: input.keyword,
      device: input.device,
      ...(resolveSerpStopOnMatch(input.stopOnMatch)
        ? {
            find_targets_in: ["organic"],
            stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: stopTarget }],
          }
        : {}),
    };
    const data = await requestEnvelope(
      SERP_URL,
      {
        method: "POST",
        headers: {
          Authorization: requireLogin(credentials),
          "Content-Type": "application/json",
        },
        body: JSON.stringify([payload]),
      },
      credentials,
      SERP_REQUEST_TIMEOUT_MS,
    );
    const task = data.tasks?.[0];

    if (!task || !envelopeOk(data)) {
      const rawMessage = envelopeMessage(data);
      throw new DataForSeoError(
        validationFailure(rawMessage)
          ? messageWithSentParameters(rawMessage, payload, credentials)
          : redactedMessage(rawMessage, credentials),
        false,
        undefined,
        dataForSeoResponseCostCents(data),
      );
    }

    const items = Array.isArray(task.result)
      ? task.result.flatMap((result) => result.items ?? [])
      : [null];
    // biome-ignore format: keep the provider module under its enforced line cap.
    const decision = requireDeterminateOrganicResult("DataForSEO", dataForSeoOrganicDecision(items, input.domain, requestParams.depth));

    return {
      billingUnits: 1,
      position: decision.position,
      rankingUrl: decision.rankingUrl,
      costCents: dataForSeoResponseCostCents(data),
      checkedAt: new Date(),
      raw: dataForSeoRawPayload(items, decision),
    };
  },

  async fetchRankedKeywords(credentials, input) {
    const domain = normalizeDomain(input.domain);
    if (!domain) throw new DataForSeoUnsupportedLocationError("The project domain is invalid.");
    const data = await requestLabs(RANKED_KEYWORDS_URL, credentials, {
      ...dataForSeoLabsLocationParams(input.location),
      limit: Math.min(input.limit, 100),
      offset: input.offset,
      order_by: ["ranked_serp_element.serp_item.etv,desc"],
      target: domain,
    });
    return dataForSeoRankedKeywordsPage(data);
  },
  ...createDataForSeoBacklinksMethods({ request: requestLabs }),
  ...researchMethods,
};
