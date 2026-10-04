import type { SerpRankInput, SerpRankResult } from "@/lib/providers/types";
import {
  type SerpSnapshotContinuation,
  SNAPSHOT_EXTENSION_WINDOW_MS,
} from "@/lib/serp/snapshot-extension";
import { decideOrganicResult } from "./organic-result-decision";
import { requireDeterminateOrganicResult } from "./payload-contract-error";
import { rawPayload, serpApiOrganicCandidates } from "./serpapi-payload";
import {
  buildSearchUrl,
  requestJson,
  requireApiKey,
  SERP_API_SEARCH_TIMEOUT_MS,
  SerpApiError,
} from "./serpapi-request";
import { serpApiUsageReceipt } from "./usage-receipts";

/** Fetch one additional page using frozen scope; provider links are never followed. */
export async function fetchSerpApiSnapshotPage(
  input: SerpRankInput,
  context: SerpSnapshotContinuation,
  start: number,
): Promise<SerpRankResult> {
  const age = Date.now() - Date.parse(context.capturedAt);
  if (
    !Number.isInteger(start) ||
    start < 10 ||
    start >= 100 ||
    start % 10 !== 0 ||
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
  const candidates = serpApiOrganicCandidates(data.organic_results, start);
  if (
    candidates.some(
      (row) =>
        typeof row.rank !== "number" ||
        !Number.isInteger(row.rank) ||
        row.rank <= start ||
        row.rank > start + 10,
    )
  ) {
    throw new SerpApiError("Provider returned invalid continuation positions.");
  }
  const decision = requireDeterminateOrganicResult(
    "SerpApi",
    decideOrganicResult({ candidates, depth: 100, domain: context.domain }),
  );
  return {
    billingUnits: serpApiUsageReceipt(data, { ok: true }).quantity,
    checkedAt: new Date(),
    costCents: 0,
    position: decision.position,
    rankingUrl: decision.rankingUrl,
    raw: {
      ...rawPayload([data], decision),
      snapshotContinuation: {
        ...context,
        nextStart: start + 10,
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
