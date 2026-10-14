import { businessDigest } from "@/lib/business-location-store/canonical";
import { projectRetainedBusinessObservation } from "@/lib/business-location-store/observation-read";
import { businessMatcherVersion } from "@/lib/business-locations/dto";
import type { BusinessMatchDecision } from "@/lib/generated/prisma/client";
import type { MeasurementScope } from "@/lib/rank-measurements/types";
import type { LocalRetainedCheck } from "./read";

export const localFixtureAsOf = new Date("2026-10-12T12:00:00.000Z");
export const localFixtureScope = {
  projectId: "project-internal",
  entityId: "subject-internal",
  identityRevisionId: "identity-1",
  asOf: localFixtureAsOf,
};
export const localFixtureSelection = {
  scope: { kind: "keyword" as const, id: "kw_abcdefghijklmnopqrstuvwx" },
  locationId: "biz_abcdefghijklmnopqrstuvwx",
  identityRevisionId: "identity-1",
  assignmentRevision: 1,
} as const;
export function expectedLocalScope(id: string): MeasurementScope {
  return {
    projectId: "project-internal",
    targetId: id,
    targetRevision: "target-1",
    policyRevision: "policy-1",
    engine: "google",
    surface: "web_serp",
    resultKind: "organic_result",
    rankScale: "organic_group",
    location: "geo-1",
    language: "en",
    device: "desktop",
  };
}
export function localCheck(
  id: string,
  slot: number | null,
  options: { failed?: boolean; absent?: boolean; incomplete?: boolean } = {},
): LocalRetainedCheck {
  const at = new Date("2026-10-12T11:00:00.000Z");
  return {
    id: `internal-${id}`,
    publicId: `check-${id}`,
    keywordId: id,
    checkedAt: at,
    createdAt: at,
    updatedAt: at,
    normalizationVersion: "normalizer-1",
    requestedDepth: 20,
    status: options.failed ? "failed" : "completed",
    provider: "synthetic",
    position: null,
    observationRun: options.failed
      ? null
      : {
          id: `run-${id}`,
          projectId: "project-internal",
          provider: "synthetic",
          surface: "web_serp",
          engine: "google",
          completeness: options.incomplete ? "unknown" : "complete",
          createdAt: at,
          executedAt: at,
          configuredScope: { location: "geo-1", language: "en", device: "desktop" },
          effectiveScope: { location: "geo-1", language: "en", device: "desktop" },
          requestPolicy: {
            evidence: {
              version: 1,
              adapterVersion: "adapter-1",
              targetRevision: "target-1",
              policyRevision: "policy-1",
              observedAt: at.toISOString(),
              requestedAt: at.toISOString(),
              completeThrough: { local_pack: options.incomplete ? null : 3 },
            },
          },
          rankCheck: { normalizationVersion: "normalizer-1" },
          items: options.absent
            ? []
            : [
                {
                  id: `item-${id}`,
                  resultKind: "local_pack",
                  ordinal: 0,
                  rankAbsolute: null,
                  rankGroup: null,
                  rawFragment: null,
                  blockPosition: 1,
                  positionInBlock: slot,
                  rankScale: "pack_slot",
                  promotion: "organic",
                  sourcePage: 1,
                  sourceBlockId: "pack-1",
                  sourceOrdinal: 0,
                  observedAt: at,
                  createdAt: at,
                  businessName: "Synthetic",
                  domain: "example.test",
                  cid: "123",
                  placeId: null,
                },
              ],
        },
  };
}
export function localDecision(
  check: LocalRetainedCheck,
  status: "confirmed" | "rejected" = "confirmed",
): BusinessMatchDecision {
  if (!check.observationRun) throw new Error("A retained observation is required");
  const normalized = projectRetainedBusinessObservation(check.observationRun);
  const item = normalized.items[0],
    source = normalized.sourceByItem.get(item?.itemId);
  if (!item || !source) throw new Error("A retained item is required");
  return {
    id: `decision-${check.id}`,
    headId: `head-${check.id}`,
    projectId: "project-internal",
    entityId: "subject-internal",
    identityRevisionId: "identity-1",
    observationRunId: check.observationRun.id,
    itemId: item.itemId,
    decisionRevision: 1,
    previousDecisionId: null,
    status,
    matchedBy: "cid",
    reason: "strong_identifier",
    source: "automatic",
    confirmedBy: null,
    reviewReason: null,
    observedAt: new Date(item.observedAt),
    recordedAt: new Date("2026-10-12T11:01:00.000Z"),
    matcherVersion: businessMatcherVersion,
    evidence: {
      normalizedItemHash: businessDigest(item),
      originalOrdinals: item.originalOrdinals,
      promotion: "organic",
      localResult: true,
      organicEligible: status === "confirmed",
      evidenceIdentifierTypes: ["cid"],
      source,
    },
  };
}
