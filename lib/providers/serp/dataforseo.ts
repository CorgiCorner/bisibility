import { normalizeDomain } from "@/lib/domains/normalize";
import type {
  ProviderCredentials,
  ProviderTestResult,
  SerpProvider,
  SerpRankInput,
} from "@/lib/providers/types";
import { resolveSerpStopOnMatch } from "@/lib/serp/markets";
import { createDataForSeoBacklinksMethods } from "./dataforseo-backlinks";
import {
  DATA_FOR_SEO_OK_STATUS,
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
  DataForSeoError,
  DataForSeoUnsupportedLocationError,
  messageWithSentParameters,
  redactedMessage,
  validationFailure,
} from "./dataforseo-errors";
import { createDataForSeoLabsClient } from "./dataforseo-labs-client";
import {
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
const LABS_STATUS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/status";
// The synchronous SERP endpoint is slower than other calls; give it more headroom.
const SERP_REQUEST_TIMEOUT_MS = 30_000;

export { DataForSeoUnsupportedLocationError } from "./dataforseo-errors";

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
          Authorization: requireDataForSeoLogin(credentials),
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
      checkedAt: new Date(),
      costCents: dataForSeoResponseCostCents(data),
      position: decision.position,
      rankingUrl: decision.rankingUrl,
      raw: dataForSeoRawPayload(items, decision),
    };
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
      target: domain,
    });
    return dataForSeoRankedKeywordsPage(data);
  },
  ...createDataForSeoBacklinksMethods({ request: requestLabs }),
  ...researchMethods,
  ...domainMethods,
};
