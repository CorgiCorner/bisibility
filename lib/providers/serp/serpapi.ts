import type {
  ProviderCredentials,
  ProviderTestResult,
  SerpProvider,
  SerpRankInput,
  SerpRankResult,
} from "@/lib/providers/types";
import type { SerpRankLocation } from "@/lib/serp/location";
import { resolveSerpDepth, resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/markets";
import { decideOrganicResult, type OrganicResultCandidate } from "./organic-result-decision";
import { requireDeterminateOrganicResult } from "./payload-contract-error";
import { rawPayload, type SerpApiResponse, serpApiOrganicCandidates } from "./serpapi-payload";

const ACCOUNT_URL = "https://serpapi.com/account.json";
const SEARCH_URL = "https://serpapi.com/search.json";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const SEARCH_REQUEST_TIMEOUT_MS = 60_000;
const RETRY_BASE_MS = 200;
const GOOGLE_ORGANIC_PAGE_SIZE = 10;

type SerpApiGoogleParams = {
  depth: SerpDepth;
  gl: string;
  hl: string;
  location: string;
};

class SerpApiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

function requireApiKey(creds: ProviderCredentials) {
  if (!creds.apiKey) {
    throw new SerpApiError("SerpApi requires an API key credential.");
  }

  return creds.apiKey;
}

// SerpApi uses `secondaryGeoName` plus gl/hl; never combine `location` with
// mutually exclusive uule/lat/lon parameters.
function serpApiGoogleParams(input: {
  depth?: number;
  location: SerpRankLocation;
}): SerpApiGoogleParams {
  const { location } = input;
  return {
    depth: resolveSerpDepth(input.depth),
    gl: location.gl,
    hl: location.hl,
    location: location.secondaryGeoName,
  };
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function safeErrorMessage(data: SerpApiResponse | null, fallback: string) {
  return typeof data?.error === "string" && data.error.trim() ? data.error : fallback;
}

async function readResponse(response: Response, creds: ProviderCredentials) {
  let data: SerpApiResponse | null = null;

  try {
    data = (await response.json()) as SerpApiResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const message = safeErrorMessage(data, `SerpApi request failed with HTTP ${response.status}.`);

    throw new SerpApiError(redactedMessage(message, creds), retryable);
  }

  if (data && typeof data.error === "string" && data.error.trim()) {
    const retryable = /rate limit|throttl|temporar|try again/i.test(data.error);
    throw new SerpApiError(redactedMessage(data.error, creds), retryable);
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

async function requestJson(
  url: string,
  creds: ProviderCredentials,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<SerpApiResponse> {
  let lastError: SerpApiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await readResponse(await fetchWithTimeout(url, {}, timeoutMs), creds);
    } catch (error) {
      lastError = providerError(error, creds);
      if (!lastError.retryable || attempt === MAX_ATTEMPTS - 1) {
        throw lastError;
      }
      await wait(retryDelay(attempt));
    }
  }

  throw lastError ?? new SerpApiError("SerpApi request failed.");
}

function searchPageStarts(depth: SerpDepth) {
  return Array.from(
    { length: Math.ceil(depth / GOOGLE_ORGANIC_PAGE_SIZE) },
    (_, index) => index * GOOGLE_ORGANIC_PAGE_SIZE,
  );
}

function buildSearchUrl(
  input: SerpRankInput,
  apiKey: string,
  googleParams: Omit<SerpApiGoogleParams, "depth">,
  start: number,
) {
  const params = new URLSearchParams({
    api_key: apiKey,
    device: input.device,
    engine: "google",
    ...googleParams,
    q: input.keyword,
  });
  if (start > 0) {
    params.set("start", String(start));
  }

  return `${SEARCH_URL}?${params.toString()}`;
}

async function fetchGoogleOrganicResults(input: SerpRankInput, apiKey: string) {
  const credentials = input.credentials ?? {};
  const { depth, ...googleParams } = serpApiGoogleParams({
    depth: input.depth,
    location: input.location,
  });
  const pages: SerpApiResponse[] = [];
  const candidates: OrganicResultCandidate[] = [];

  for (const start of searchPageStarts(depth)) {
    const data = await requestJson(
      buildSearchUrl(input, apiKey, googleParams, start),
      credentials,
      SEARCH_REQUEST_TIMEOUT_MS,
    );
    const pageResults = data.organic_results;

    if (!Array.isArray(pageResults)) {
      if (start > 0) {
        break;
      }
      throw new SerpApiError("SerpApi response did not include organic results.");
    }

    pages.push(data);
    candidates.push(...serpApiOrganicCandidates(pageResults, start));

    const decision = decideOrganicResult({ candidates, depth, domain: input.domain });
    if (resolveSerpStopOnMatch(input.stopOnMatch) && decision.outcome === "match") {
      break;
    }

    if (pageResults.length === 0) {
      break;
    }
  }

  return { candidates, depth, pages };
}

export const serpApiProvider: SerpProvider = {
  id: "serpapi",
  label: "SerpApi",

  async testConnection(creds: ProviderCredentials): Promise<ProviderTestResult> {
    try {
      const apiKey = requireApiKey(creds);
      const data = await requestJson(`${ACCOUNT_URL}?api_key=${encodeURIComponent(apiKey)}`, creds);
      const balance = data.total_searches_left ?? data.plan_searches_left;

      return {
        ok: true,
        message: "Connected.",
        balance: typeof balance === "number" ? balance : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "SerpApi connection test failed.",
      };
    }
  },

  async fetchRank(input: SerpRankInput): Promise<SerpRankResult> {
    const credentials = input.credentials ?? {};
    const { candidates, depth, pages } = await fetchGoogleOrganicResults(
      input,
      requireApiKey(credentials),
    );
    const decision = requireDeterminateOrganicResult(
      "SerpApi",
      decideOrganicResult({ candidates, depth, domain: input.domain }),
    );

    return {
      billingUnits: pages.length,
      position: decision.position,
      rankingUrl: decision.rankingUrl,
      costCents: 0,
      checkedAt: new Date(),
      raw: rawPayload(pages, decision),
    };
  },
};
