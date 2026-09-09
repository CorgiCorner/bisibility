import { normalizeDomain } from "@/lib/domains/normalize";
import { ProviderCallError } from "@/lib/providers/call-error";
import type { ProviderErrorCode } from "@/lib/providers/provider-error-code";
import type {
  ProviderCredentials,
  ProviderTestResult,
  SerpProvider,
  SerpRankInput,
} from "@/lib/providers/types";
import { resolveSerpStopOnMatch } from "@/lib/serp/constants";
import { createDataForSeoBacklinksMethods } from "./dataforseo-backlinks";
import {
  DATA_FOR_SEO_OK_STATUS,
  dataForSeoBillingStatusCode,
  dataForSeoGoogleParams,
  dataForSeoLabsLocationParams,
  envelopeMessage,
  envelopeOk,
  extractDataForSeoBalance,
  requestAuthenticatedEnvelope,
  requestEnvelope,
  requireDataForSeoLogin,
} from "./dataforseo-client";
import { createDataForSeoDomainMethods } from "./dataforseo-domain";
import {
  DataForSeoBillingError,
  DataForSeoError,
  DataForSeoUnsupportedLocationError,
  messageWithSentParameters,
  redactedMessage,
  validationFailure,
} from "./dataforseo-errors";
import { createDataForSeoLabsClient } from "./dataforseo-labs-client";
import {
  DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS,
  dataForSeoOrganicDecision,
  dataForSeoRankedKeywordsPage,
  dataForSeoRawPayload,
  dataForSeoResponseCostCents,
} from "./dataforseo-payload";
import { createDataForSeoResearchMethods } from "./dataforseo-research";
import { dataForSeoObservationRun } from "./observation-extract-dataforseo";
import { requireDeterminateOrganicResult } from "./payload-contract-error";

const USER_DATA_URL = "https://api.dataforseo.com/v3/appendix/user_data";
const SERP_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const RANKED_KEYWORDS_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live";
const LABS_STATUS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/status";
const STOP_ON_MATCH_TYPE = "with_subdomains";
// The synchronous SERP endpoint is slower than other calls; give it more headroom.
const SERP_REQUEST_TIMEOUT_MS = 30_000;

export { DataForSeoUnsupportedLocationError } from "./dataforseo-errors";

function classifyDataForSeoError(error: unknown): ProviderErrorCode {
  if (error instanceof DataForSeoBillingError) return "provider_billing";
  if (error instanceof DataForSeoError) {
    const status = error.httpStatus;
    if (status === 402) return "provider_billing";
    if (status === 401 || status === 403) return "provider_auth";
    if (status === 429) return "provider_rate_limited";
    const message = error.message.toLowerCase();
    if (/payment required|negative balance|insufficient funds?/.test(message)) {
      return "provider_billing";
    }
  }
  return "provider_transient";
}

function withProviderErrorCode<T extends ProviderCallError>(error: T): T {
  error.code = classifyDataForSeoError(error);
  return error;
}

const { request: requestLabs, requestStatus: requestLabsStatus } = createDataForSeoLabsClient({
  envelopeMessage,
  envelopeOk,
  requestAuthenticatedEnvelope,
  statusUrl: LABS_STATUS_URL,
});
const researchMethods = createDataForSeoResearchMethods({
  locationParams: dataForSeoLabsLocationParams,
  request: requestLabs,
});
const domainMethods = createDataForSeoDomainMethods({
  locationParams: dataForSeoLabsLocationParams,
  request: requestLabs,
  requestStatus: requestLabsStatus,
});

async function fetchDataForSeoRank(input: SerpRankInput) {
  const credentials = input.credentials ?? {};
  const requestParams = dataForSeoGoogleParams({
    depth: input.depth,
    location: input.location,
  });
  const stopOnMatch = resolveSerpStopOnMatch(input.stopOnMatch);
  const stopTarget = normalizeDomain(input.domain) ?? input.domain;
  const payload = {
    ...requestParams,
    keyword: input.keyword,
    search_param: "&nfpr=1",
    device: input.device,
    ...(input.tag ? { tag: input.tag } : {}),
    ...(stopOnMatch
      ? {
          find_targets_in: ["organic"],
          stop_crawl_on_match: [{ match_type: STOP_ON_MATCH_TYPE, match_value: stopTarget }],
        }
      : {}),
  };
  const data = await requestEnvelope(
    SERP_URL,
    {
      method: "POST",
      headers: {
        Authorization: requireDataForSeoLogin(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([payload]),
    },
    credentials,
    SERP_REQUEST_TIMEOUT_MS,
  );
  const task = data.tasks?.[0];

  const noSearchResults =
    data.status_code === DATA_FOR_SEO_OK_STATUS &&
    task?.status_code === DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS;
  if (!task || (!envelopeOk(data) && !noSearchResults)) {
    const billingStatusCode = dataForSeoBillingStatusCode(data);
    const rawMessage =
      !task && data.status_code === DATA_FOR_SEO_OK_STATUS
        ? "DataForSEO SERP response did not include a task."
        : envelopeMessage(data);
    const message = validationFailure(rawMessage)
      ? messageWithSentParameters(rawMessage, payload, credentials)
      : redactedMessage(rawMessage, credentials);
    const costCents = dataForSeoResponseCostCents(data);
    if (billingStatusCode !== undefined) throw new DataForSeoBillingError(message, costCents);
    throw new DataForSeoError(message, false, undefined, costCents);
  }

  const items = noSearchResults
    ? []
    : Array.isArray(task.result)
      ? task.result.flatMap((result) => result.items ?? [])
      : [null];
  // biome-ignore format: keep the provider module under its enforced line cap.
  const decision = requireDeterminateOrganicResult("DataForSEO", dataForSeoOrganicDecision(items, input.domain, requestParams.depth));
  const checkedAt = new Date();

  return {
    billingUnits: 1,
    checkedAt,
    costCents: dataForSeoResponseCostCents(data),
    position: decision.position,
    rankingUrl: decision.rankingUrl,
    raw: dataForSeoRawPayload(items, decision),
    observation: dataForSeoObservationRun({
      completeness:
        stopOnMatch && decision.outcome === "match"
          ? "truncated_by_stop_on_match"
          : stopOnMatch
            ? "unknown"
            : "complete",
      configuredScope: {
        device: input.device,
        language: input.location.hl,
        location: input.location.primaryGeoName,
      },
      effectiveScope: null,
      executedAt: checkedAt,
      items,
      requestPolicy: {
        depth: requestParams.depth,
        findTargetsIn: stopOnMatch ? STOP_ON_MATCH_TYPE : null,
        forcedAiOverview: false,
        stopOnMatch,
      },
    }),
  };
}

export const dataForSeoProvider: SerpProvider = {
  id: "dataforseo",
  label: "DataForSEO",

  async testConnection(creds: ProviderCredentials): Promise<ProviderTestResult> {
    try {
      const data = await requestEnvelope(
        USER_DATA_URL,
        {
          headers: { Authorization: requireDataForSeoLogin(creds) },
        },
        creds,
      );
      const ok = data.status_code === DATA_FOR_SEO_OK_STATUS;

      return {
        ok,
        message: data.status_message ?? (ok ? "Connected." : "DataForSEO connection test failed."),
        balance: extractDataForSeoBalance(data),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "DataForSEO connection test failed.",
      };
    }
  },

  async fetchRank(input: SerpRankInput) {
    try {
      return await fetchDataForSeoRank(input);
    } catch (error) {
      if (error instanceof ProviderCallError) throw withProviderErrorCode(error);
      throw error;
    }
  },

  async fetchRankedKeywords(credentials, input) {
    const domain = normalizeDomain(input.domain);
    if (!domain) throw new DataForSeoUnsupportedLocationError("The project domain is invalid.");
    const marketParams =
      input.locationCode === undefined
        ? dataForSeoLabsLocationParams(input.location)
        : {
            language_code: input.languageCode ?? input.location.hl,
            location_code: input.locationCode,
          };
    const data = await requestLabs(RANKED_KEYWORDS_URL, credentials, {
      ...marketParams,
      limit: Math.min(input.limit, 1_000),
      offset: input.offset,
      order_by: ["ranked_serp_element.serp_item.etv,desc"],
      ...(input.tag ? { tag: input.tag } : {}),
      target: domain,
    });
    return dataForSeoRankedKeywordsPage(data);
  },
  ...createDataForSeoBacklinksMethods({ request: requestLabs }),
  ...researchMethods,
  ...domainMethods,
};
