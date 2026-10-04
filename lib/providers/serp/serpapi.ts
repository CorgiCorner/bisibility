import type {
  ProviderCredentials,
  ProviderTestResult,
  SerpProvider,
  SerpRankInput,
  SerpRankResult,
} from "@/lib/providers/types";
import { resolveSerpDepth, resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/constants";
import type { SerpRankLocation } from "@/lib/serp/location";
import { serpApiObservationRun } from "./observation-extract-serpapi";
import { decideOrganicResult, type OrganicResultCandidate } from "./organic-result-decision";
import { requireDeterminateOrganicResult } from "./payload-contract-error";
import { rawPayload, type SerpApiResponse, serpApiOrganicCandidates } from "./serpapi-payload";
import {
  buildSearchUrl,
  requestJson,
  requireApiKey,
  SERP_API_SEARCH_TIMEOUT_MS,
  SerpApiError,
} from "./serpapi-request";
import { serpApiUsageReceipt } from "./usage-receipts";

const ACCOUNT_URL = "https://serpapi.com/account.json";
const GOOGLE_ORGANIC_PAGE_SIZE = 10;

type SerpApiGoogleParams = { depth: SerpDepth; gl: string; hl: string; location: string };

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

function nonnegativeFinite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function finiteSum(left: number, right: number) {
  const sum = left + right;
  return Number.isFinite(sum) && sum >= 0 ? sum : undefined;
}

function searchPageStarts(depth: SerpDepth) {
  return Array.from(
    { length: Math.ceil(depth / GOOGLE_ORGANIC_PAGE_SIZE) },
    (_, index) => index * GOOGLE_ORGANIC_PAGE_SIZE,
  );
}

async function fetchGoogleOrganicResults(input: SerpRankInput, apiKey: string) {
  const credentials = input.credentials ?? {};
  const { depth, ...googleParams } = serpApiGoogleParams({
    depth: input.depth,
    location: input.location,
  });
  const pages: SerpApiResponse[] = [];
  const candidates: OrganicResultCandidate[] = [];
  const pageStarts = searchPageStarts(depth);
  const stopOnMatch = resolveSerpStopOnMatch(input.stopOnMatch);
  let stoppedOnMatch = false;
  let reachedEnd = false;
  let billingUnits: number | null = 0;

  for (const start of pageStarts) {
    const data = await requestJson(
      buildSearchUrl(input, apiKey, googleParams, start),
      credentials,
      SERP_API_SEARCH_TIMEOUT_MS,
    );
    const quantity = serpApiUsageReceipt(data, { ok: true }).quantity;
    billingUnits = billingUnits === null || quantity === null ? null : billingUnits + quantity;
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
    if (stopOnMatch && decision.outcome === "match") {
      stoppedOnMatch = true;
      break;
    }

    if (
      pageResults.length === 0 ||
      !(
        data.serpapi_pagination?.next ||
        data.serpapi_pagination?.next_link ||
        data.pagination?.next
      )
    ) {
      reachedEnd = true;
      break;
    }
  }

  return {
    billingUnits,
    candidates,
    depth,
    pages,
    reachedEnd,
    requestedPageCount: pageStarts.length,
    stoppedOnMatch,
  };
}

export const serpApiProvider: SerpProvider = {
  id: "serpapi",
  label: "SerpApi",

  async testConnection(creds: ProviderCredentials): Promise<ProviderTestResult> {
    try {
      const apiKey = requireApiKey(creds);
      const data = await requestJson(`${ACCOUNT_URL}?api_key=${encodeURIComponent(apiKey)}`, creds);
      const usesTotalBalance = nonnegativeFinite(data.total_searches_left) !== undefined;
      const balance = usesTotalBalance
        ? nonnegativeFinite(data.total_searches_left)
        : nonnegativeFinite(data.plan_searches_left);
      const monthlyCapacity = nonnegativeFinite(data.searches_per_month);
      const extraCredits = nonnegativeFinite(data.extra_credits);
      const validExtraCredits = data.extra_credits === undefined || extraCredits !== undefined;
      const availabilityTotal =
        usesTotalBalance && monthlyCapacity !== undefined && validExtraCredits
          ? finiteSum(monthlyCapacity, extraCredits ?? 0)
          : undefined;

      return {
        ok: true,
        message: "Connected.",
        ...(balance === undefined ? {} : { balance }),
        ...(availabilityTotal === undefined ? {} : { availabilityTotal }),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "SerpApi connection test failed.",
      };
    }
  },

  async fetchRank(input: SerpRankInput): Promise<SerpRankResult> {
    const capturedAt = new Date().toISOString();
    const credentials = input.credentials ?? {};
    const {
      billingUnits,
      candidates,
      depth,
      pages,
      reachedEnd,
      requestedPageCount,
      stoppedOnMatch,
    } = await fetchGoogleOrganicResults(input, requireApiKey(credentials));
    const decision = requireDeterminateOrganicResult(
      "SerpApi",
      decideOrganicResult({ candidates, depth, domain: input.domain }),
    );

    const stopOnMatch = resolveSerpStopOnMatch(input.stopOnMatch);
    const checkedAt = new Date();
    return {
      billingUnits,
      position: decision.position,
      rankingUrl: decision.rankingUrl,
      costCents: 0,
      checkedAt,
      raw: {
        ...rawPayload(pages, decision),
        snapshotContinuation: {
          version: 1,
          capturedAt,
          keyword: input.keyword,
          domain: input.domain,
          device: input.device,
          location: input.location,
          nextStart: pages.length * GOOGLE_ORGANIC_PAGE_SIZE,
          ended: reachedEnd,
        },
      },
      observation: serpApiObservationRun({
        completeness: stoppedOnMatch
          ? "truncated_by_stop_on_match"
          : reachedEnd || pages.length === requestedPageCount
            ? "complete"
            : "unknown",
        configuredScope: {
          device: input.device,
          language: input.location.hl,
          location: input.location.primaryGeoName,
        },
        effectiveScope: null,
        executedAt: checkedAt,
        pages,
        requestPolicy: { depth, findTargetsIn: null, forcedAiOverview: false, stopOnMatch },
      }),
    };
  },
};
