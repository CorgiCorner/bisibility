import { redactProviderResponse } from "@/lib/providers/provider-response";
import type {
  ProviderCredentials,
  ProviderTestResult,
  SerpProvider,
  SerpRankInput,
  SerpRankResult,
} from "@/lib/providers/types";
import { resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/constants";
import { serpApiObservationRun } from "./observation-extract-serpapi";
import { OrganicCoverageError } from "./organic-coverage-error";
import {
  decideOrganicResult,
  inspectOrganicCandidates,
  type OrganicResultCandidate,
} from "./organic-result-decision";
import { completeSerpApiOverview } from "./serpapi-overview";
import { serpApiPageCoverage } from "./serpapi-page-coverage";
import { rawPayload, requireSerpApiOrganicDecision, type SerpApiResponse } from "./serpapi-payload";
import {
  buildSearchUrl,
  requestJson,
  requireApiKey,
  SERP_API_SEARCH_TIMEOUT_MS,
  SerpApiError,
  serpApiGoogleParams,
} from "./serpapi-request";
import { serpApiUsageReceipt } from "./usage-receipts";
import type { SentWebPage } from "./web-local-proof";

const ACCOUNT_URL = "https://serpapi.com/account.json";
const GOOGLE_ORGANIC_PAGE_SIZE = 10;

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
  if (input.fetchAiOverview && depth !== 10)
    throw new Error("Overview lookup requires a quoted single search page.");
  const pages: SerpApiResponse[] = [];
  const nativePages: SerpApiResponse[] = [];
  const sentPages: SentWebPage[] = [];
  const candidates: OrganicResultCandidate[] = [];
  const pageStarts = searchPageStarts(depth);
  const stopOnMatch = resolveSerpStopOnMatch(input.stopOnMatch);
  const acceptPage = serpApiPageCoverage();
  let coveredPrefix = 0;
  let stoppedOnMatch = false;
  let reachedEnd = false;
  let billingUnits: number | null = 0;

  for (const start of pageStarts) {
    const sentPage: SentWebPage = {
      engine: "google",
      start,
      wireLocation: googleParams.location,
      scope: {
        location: input.location.primaryGeoName,
        language: googleParams.hl,
        device: input.device,
      },
    };
    let data = await requestJson(
      buildSearchUrl(input, apiKey, googleParams, start),
      credentials,
      SERP_API_SEARCH_TIMEOUT_MS,
    );
    const quantity = serpApiUsageReceipt(data, { ok: true }).quantity;
    billingUnits = billingUnits === null || quantity === null ? null : billingUnits + quantity;
    nativePages.push(data);
    if (start === 0 && input.fetchAiOverview) {
      const followup = await completeSerpApiOverview(data, credentials, apiKey);
      if (followup) {
        nativePages.push(followup.native);
        billingUnits =
          billingUnits === null || followup.quantity === null
            ? null
            : billingUnits + followup.quantity;
        if (followup.overview)
          data = { ...data, ai_overview: followup.overview } as SerpApiResponse;
      }
    }
    const pageResults = data.organic_results;

    if (!Array.isArray(pageResults)) {
      if (start > 0) {
        break;
      }
      throw new SerpApiError("SerpApi response did not include organic results.");
    }

    const accepted = acceptPage(data, start, pageResults);
    coveredPrefix = accepted.coveredPrefix;
    pages.push(data);
    sentPages.push(sentPage);
    candidates.push(...accepted.candidates);
    reachedEnd = !(
      data.serpapi_pagination?.next ||
      data.serpapi_pagination?.next_link ||
      data.pagination?.next
    );

    const decision = decideOrganicResult({ candidates, depth, domain: input.domain });
    if (stopOnMatch && decision.outcome === "match") {
      stoppedOnMatch = true;
      break;
    }

    if (reachedEnd) break;
  }

  return {
    billingUnits,
    nativePages,
    candidates,
    coveredPrefix,
    depth,
    pages,
    reachedEnd,
    sentPages,
    stoppedOnMatch,
  };
}

export const serpApiProvider: SerpProvider = {
  payment: {
    unit: {
      kind: "provider_native",
      providerId: "serpapi",
      key: "searches",
      singular: "search",
      plural: "searches",
    },
    basis: "provider_quantity",
    estimateQuantity: (feature, itemCount) =>
      feature === "rank_check" && Number.isSafeInteger(itemCount) && itemCount >= 0
        ? String(itemCount)
        : null,
  },
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
      nativePages,
      candidates,
      coveredPrefix,
      depth,
      pages,
      reachedEnd,
      sentPages,
      stoppedOnMatch,
    } = await fetchGoogleOrganicResults(input, requireApiKey(credentials));
    const candidate = decideOrganicResult({ candidates, depth, domain: input.domain });
    const decision = input.allowIncompleteResults
      ? candidate
      : requireSerpApiOrganicDecision(candidate);
    const complete = decision.outcome !== "indeterminate" && (reachedEnd || coveredPrefix >= depth);
    if (
      !input.allowIncompleteResults &&
      !complete &&
      (decision.position === null || decision.position > coveredPrefix)
    ) {
      throw new OrganicCoverageError(
        `${coveredPrefix}/${depth} continuous organic ranks within the admitted page budget`,
      );
    }

    const stopOnMatch = resolveSerpStopOnMatch(input.stopOnMatch);
    const checkedAt = new Date();
    return {
      billingUnits,
      ...(input.captureProviderResponse
        ? { providerResponse: redactProviderResponse(nativePages) }
        : {}),
      position: decision.position,
      rankingUrl: decision.rankingUrl,
      costCents: 0,
      checkedAt,
      raw: {
        ...rawPayload(pages, decision),
        provider_response: redactProviderResponse(nativePages),
        ...(decision.outcome === "indeterminate"
          ? { organic_results: inspectOrganicCandidates(candidates) }
          : {}),
        snapshotContinuation: {
          version: 1,
          capturedAt,
          keyword: input.keyword,
          domain: input.domain,
          device: input.device,
          location: input.location,
          nextStart: pages.length * GOOGLE_ORGANIC_PAGE_SIZE,
          ended: reachedEnd,
          organicReturned: candidates.length,
        },
      },
      observation: serpApiObservationRun({
        completeness: stoppedOnMatch
          ? "truncated_by_stop_on_match"
          : complete
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
        sentPages,
        requestPolicy: { depth, findTargetsIn: null, forcedAiOverview: false, stopOnMatch },
      }),
    };
  },
};
