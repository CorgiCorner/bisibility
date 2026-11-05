import { serpApiCapturedMetadata } from "@/lib/observation/provider-metadata";
import type { SerpRankInput, SerpRankResult } from "@/lib/providers/types";
import {
  type SerpSnapshotContinuation,
  SNAPSHOT_EXTENSION_WINDOW_MS,
} from "@/lib/serp/snapshot-extension";
import { decideOrganicResult } from "./organic-result-decision";
import {
  rawPayload,
  requireSerpApiOrganicDecision,
  serpApiOrganicCandidates,
} from "./serpapi-payload";
import {
  buildSearchUrl,
  requestJson,
  requireApiKey,
  SERP_API_SEARCH_TIMEOUT_MS,
  SerpApiError,
} from "./serpapi-request";
import { serpApiUsageReceipt } from "./usage-receipts";

/**
 * Fetch one additional page using frozen scope; provider links are never followed.
 * `precedingOrganicCount` is the number of organic results already stored for this snapshot, so
 * ranks continue the same ordinal as the measurement path without a provider call to recount.
 */
export async function fetchSerpApiSnapshotPage(
  input: SerpRankInput,
  context: SerpSnapshotContinuation,
  start: number,
  precedingOrganicCount: number,
): Promise<SerpRankResult> {
  if (process.env.BISIBILITY_FAKE_PROVIDER === "1")
    throw new SerpApiError(
      "Snapshot continuation requires an explicit synthetic adapter in fake mode.",
    );
  const age = Date.now() - Date.parse(context.capturedAt);
  if (
    !Number.isInteger(start) ||
    start < 10 ||
    start >= 100 ||
    start % 10 !== 0 ||
    !Number.isInteger(precedingOrganicCount) ||
    precedingOrganicCount < 0 ||
    precedingOrganicCount > start ||
    age < 0 ||
    age >= SNAPSHOT_EXTENSION_WINDOW_MS
  ) {
    throw new SerpApiError("Snapshot continuation window closed.");
  }
  const credentials = input.credentials ?? {};
  const frozen = {
    ...input,
    keyword: context.keyword,
    device: context.device,
    location: context.location,
    domain: context.domain,
  };
  const data = await requestJson(
    buildSearchUrl(
      frozen,
      requireApiKey(credentials),
      {
        gl: context.location.gl,
        hl: context.location.hl,
        location: context.location.secondaryGeoName,
      },
      start,
    ),
    credentials,
    SERP_API_SEARCH_TIMEOUT_MS,
    1,
  );
  if (!Array.isArray(data.organic_results) || data.organic_results.length > 10)
    throw new SerpApiError("Provider returned an invalid continuation page.");
  const candidates = serpApiOrganicCandidates(data.organic_results, precedingOrganicCount);
  if (
    candidates.some(
      (row) =>
        typeof row.rank !== "number" ||
        !Number.isInteger(row.rank) ||
        row.rank <= precedingOrganicCount ||
        row.rank > precedingOrganicCount + 10,
    )
  ) {
    throw new SerpApiError("Provider returned invalid continuation positions.");
  }
  const decision = requireSerpApiOrganicDecision(
    decideOrganicResult({ candidates, depth: 100, domain: context.domain }),
  );
  const metadata = serpApiCapturedMetadata([data]);
  return {
    billingUnits: serpApiUsageReceipt(data, { ok: true }).quantity,
    checkedAt: new Date(),
    costCents: 0,
    position: decision.position,
    rankingUrl: decision.rankingUrl,
    raw: {
      ...rawPayload([data], decision),
      snapshotPageEvidence: {
        version: 1,
        adapterVersion: "serpapi-observation-v1",
        nextStart: start,
        requestDepth: 10,
        observedAt: metadata.observedAt,
        observedThrough: metadata.observedThrough,
        effectiveScope: metadata.effectiveScope,
        configuredScope: {
          location: context.location.primaryGeoName,
          language: context.location.hl,
          device: context.device,
        },
        completeThrough: null,
        completeness: "unknown",
      },
      snapshotContinuation: {
        ...context,
        nextStart: start + 10,
        organicReturned: precedingOrganicCount + data.organic_results.length,
        ended:
          data.organic_results.length === 0 ||
          !(
            data.serpapi_pagination?.next ||
            data.serpapi_pagination?.next_link ||
            data.pagination?.next
          ),
      },
    },
  };
}
