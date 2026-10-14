import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { createPointRevision } from "@/lib/local-monitoring/geometry";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { executionTargetKey, operationKey } from "@/lib/local-monitoring/target-key";
import {
  LOCAL_ADAPTER_VERSION,
  LOCAL_CAPABILITY_VERSION,
  type LocalProviderBinding,
  type LocalProviderSurface,
} from "./contracts";

export const nativeIds = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
] as const;
export const receiptTime = new Date("2026-10-12T12:00:00.000Z");
export function localBindingFixture(surface: LocalProviderSurface = "maps"): LocalProviderBinding {
  const point = createPointRevision({
    revisionId: "synthetic-point-v1",
    latitude: "52.2297",
    longitude: "21.0122",
  });
  return {
    point,
    requestedAt: "2026-10-12T11:00:00.000Z",
    keyword: {
      id: "synthetic-keyword",
      revision: "synthetic-keyword-v1",
      text: "synthetic cafe + 50%",
    },
    target: {
      version: 1,
      projectId: "synthetic-project",
      keywordId: "synthetic-keyword",
      keywordRevision: "synthetic-keyword-v1",
      pointRevision: point.revisionKey,
      engine: "google",
      surface,
      resultKind: surface === "maps" ? "map_listing" : "listing",
      rankScale: surface === "maps" ? "maps_organic" : "finder_organic",
      language: "en",
      device: "desktop",
      operatingSystem: "windows",
      cutoff: 20,
      zoom: 14,
      policyRevision: "synthetic-local-policy-v1",
    },
  };
}
export function acceptedTaskEnvelope(id: string = nativeIds[0]) {
  return {
    status_code: 20000,
    tasks_count: 1,
    cost: 0.012,
    tasks: [{ id, status_code: 20100, cost: 0.012, result: null }],
  };
}
export function resultEnvelope(surface: LocalProviderSurface = "maps", id: string = nativeIds[0]) {
  const listing = surface === "maps" ? "maps_search" : "local_pack";
  return {
    status_code: 20000,
    tasks_count: 1,
    cost: 0,
    tasks: [
      {
        id,
        status_code: 20000,
        cost: 0,
        result: [
          {
            type: surface,
            datetime: "2026-10-11 11:58:00 +00:00",
            language_code: "en",
            location_code: 2840,
            // Request echo and check_url are deliberately not effective-point proof.
            check_url: "https://untrusted.invalid/private-url",
            items_count: 20,
            se_results_count: 20,
            items: [
              {
                type: listing,
                rank_group: 1,
                rank_absolute: 1,
                cid: "9007199254740993123",
                place_id: "OpaquePlace_A",
                title: "Synthetic Branch A",
                domain: "synthetic.invalid",
                url: "https://synthetic.invalid/branch-a",
                is_paid: false,
              },
              {
                type: surface === "maps" ? "maps_paid_item" : listing,
                rank_group: surface === "maps" ? 1 : 2,
                rank_absolute: 2,
                title: "Synthetic Promoted",
                is_paid: true,
              },
              {
                type: listing,
                rank_group: 3,
                rank_absolute: 3,
                cid: "9007199254740993124",
                title: "Synthetic Branch B",
                domain: "synthetic.invalid",
                url: "javascript:alert('synthetic')",
              },
            ],
          },
        ],
      },
    ],
  };
}
export function settledRecord(binding = localBindingFixture()): SubmissionRecord {
  const scope = {
    projectId: binding.target.projectId,
    operation: "local_scan_submit" as const,
    idempotencyKey: "synthetic-submit-key",
  };
  return {
    key: operationKey(scope),
    version: 4,
    scope,
    targetKey: executionTargetKey(binding.target),
    quoteHash: "synthetic-quote-hash",
    provider: "dataforseo",
    adapterVersion: LOCAL_ADAPTER_VERSION,
    providerPriceVersion: "synthetic-price-v1",
    status: "accepted",
    attemptId: "synthetic-attempt-v1",
    settlementRecorded: true,
    cancellationRequested: true,
    collectedEvidenceId: null,
    outcome: {
      acceptance: "accepted",
      taskIds: [nativeIds[0]],
      receivedAt: receiptTime.toISOString(),
      usage: { cached: false, costCents: 1.2, quantity: 1, failed: false },
    },
  };
}
export const localDocumentaryVersion = LOCAL_CAPABILITY_VERSION;
export function quoteFixture(binding = localBindingFixture()): LocalQuote {
  return {
    version: 1,
    projectId: binding.target.projectId,
    expectedTargetKeys: [executionTargetKey(binding.target)],
    effectiveOptions: { cutoff: "20", zoom: "14" },
    capabilityVersion: LOCAL_CAPABILITY_VERSION,
    provider: "dataforseo",
    adapterVersion: LOCAL_ADAPTER_VERSION,
    providerPriceVersion: "synthetic-price-v1",
    nativeEstimates: [{ unit: "cents", amount: null }],
    issuedAt: "2026-10-12T11:00:00.000Z",
    expiresAt: "2026-10-12T13:00:00.000Z",
  };
}
