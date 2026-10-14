import { businessDigest } from "@/lib/business-location-store/canonical";
import { storedMatch } from "@/lib/business-location-store/match-repository";
import {
  projectRetainedBusinessObservation,
  retainedBusinessObservationSelect,
} from "@/lib/business-location-store/observation-read";
import { mapsBusinessMatcherVersion } from "@/lib/business-locations/dto";
import { organicEligibility } from "@/lib/business-locations/match-evidence";
import type { BusinessMatchDecision, Prisma } from "@/lib/generated/prisma/client";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { unknownLocalObservationTime } from "@/lib/local-monitoring-store/unknown-observation-time";
import { MAPS_ADAPTER_VERSION } from "@/lib/providers/local-search/maps-capability";
import type {
  MeasurementEvidence,
  MeasurementReason,
  MeasurementScope,
} from "@/lib/rank-measurements/types";
import { z } from "zod";
import type { LocalResultBinding } from "./binding";
import { LocalResultUnavailableError } from "./errors";
export const resultObservationSelect = {
  ...retainedBusinessObservationSelect,
  neutralExecutionItemId: true,
  executedAt: true,
  createdAt: true,
  completeness: true,
  configuredScope: true,
  effectiveScope: true,
} satisfies Prisma.ObservationRunSelect;
export type ResultObservation = Prisma.ObservationRunGetPayload<{
  select: typeof resultObservationSelect;
}>;
const timestamp = z.iso.datetime({ precision: 3 }).nullable(),
  scopeSchema = z
    .object({
      location: z.string(),
      language: z.string(),
      device: z.string(),
      pointRevisionId: z.string(),
      coordinates: z.object({ latitude: z.string(), longitude: z.string() }).strict(),
      zoom: z.number().nullable(),
      scopeClass: z.enum(["coordinate_seed", "coordinate_observed"]),
    })
    .strict();
const policySchema = z
  .object({
    depth: z.number(),
    cutoff: z.number(),
    zoom: z.number().nullable(),
    policyRevision: z.string(),
    pointRevisionId: z.string(),
    pointAcknowledgment: z
      .object({
        version: z.literal(1),
        class: z.literal("coordinate_seed"),
        known: z.boolean(),
        exactObserverPoint: z.literal(false),
      })
      .strict()
      .optional(),
    evidence: z
      .object({
        version: z.literal(1),
        adapterVersion: z.string(),
        targetRevision: z.string(),
        policyRevision: z.string(),
        observedAt: timestamp,
        requestedAt: timestamp,
        completeThrough: z.record(z.string(), z.number().nullable()),
      })
      .passthrough(),
    localExecution: z
      .object({
        version: z.literal(1),
        operationKey: z.string(),
        targetKey: z.string(),
        acceptedTaskIdsHash: z.string(),
        normalizedHash: z.string(),
      })
      .strict(),
  })
  .passthrough();
export function localPointEvidence(
  row: LocalResultBinding["rows"][number],
  observation: ResultObservation | null,
  decisions: readonly BusinessMatchDecision[],
  identityRevisionId: string,
  asOf: Date,
) {
  const { target, point, record, stored, item } = row;
  const empty: MeasurementEvidence = {
    id: item.id,
    targetId: stored.targetKey,
    execution: record.status === "rejected" ? "failed" : "pending",
    position: null,
    requestedDepth: target.cutoff,
    normalizationVersion: null,
    provider: record.provider,
    configuredScope: null,
    effectiveScope: null,
    completeness: "unknown",
    completeThrough: null,
    observedAt: null,
    recordedAt: item.createdAt,
    requestedAt: null,
  };
  if (!observation || observation.createdAt > asOf)
    return {
      measurement: empty,
      scopeClass: "unavailable" as const,
      match: "unavailable" as const,
      listingMatches: new Map<string, string>(),
      qualityReason: null as MeasurementReason | null,
    };
  const policy = policySchema.parse(observation.requestPolicy),
    configured = scopeSchema.parse(observation.configuredScope),
    effective = scopeSchema.safeParse(observation.effectiveScope);
  if (
    observation.projectId !== item.projectId ||
    observation.neutralExecutionItemId !== item.id ||
    record.collectedEvidenceId !== observation.id ||
    observation.provider !== record.provider ||
    observation.surface !== target.surface ||
    observation.engine !== target.engine ||
    policy.depth !== target.cutoff ||
    policy.cutoff !== target.cutoff ||
    policy.zoom !== target.zoom ||
    policy.pointRevisionId !== point.revisionId ||
    policy.policyRevision !== target.policyRevision ||
    policy.evidence.adapterVersion !== record.adapterVersion ||
    policy.evidence.targetRevision !== record.targetKey ||
    policy.evidence.policyRevision !== target.policyRevision ||
    policy.localExecution.operationKey !== record.key ||
    policy.localExecution.targetKey !== record.targetKey ||
    !record.outcome ||
    policy.localExecution.acceptedTaskIdsHash !== localDigest([...record.outcome.taskIds].sort()) ||
    configured.pointRevisionId !== point.revisionId ||
    localDigest(configured.coordinates) !== localDigest(point.coordinate) ||
    configured.zoom !== target.zoom ||
    configured.language !== target.language ||
    configured.device !== target.device
  )
    throw new LocalResultUnavailableError();
  const scope: MeasurementScope = {
    projectId: item.projectId,
    targetId: stored.targetKey,
    targetRevision: record.targetKey,
    engine: target.engine,
    surface: target.surface,
    resultKind: target.resultKind,
    rankScale: target.rankScale,
    location: JSON.stringify([
      "coordinate_seed",
      point.revisionKey,
      point.coordinate,
      target.zoom,
      target.operatingSystem,
    ]),
    language: target.language,
    device: target.device,
    policyRevision: target.policyRevision,
    identityRevision: identityRevisionId,
  };
  const acknowledged =
    record.adapterVersion === MAPS_ADAPTER_VERSION &&
    policy.pointAcknowledgment?.known === true &&
    effective.success &&
    effective.data.scopeClass === "coordinate_seed" &&
    localDigest(configured) === localDigest(effective.data);
  if (unknownLocalObservationTime(observation, record, item.id, target)) {
    if (decisions.length) throw new LocalResultUnavailableError();
    return {
      measurement: {
        ...empty,
        id: observation.id,
        execution: "completed" as const,
        normalizationVersion: `${record.adapterVersion}:${mapsBusinessMatcherVersion}`,
        configuredScope: scope,
        effectiveScope: acknowledged ? scope : null,
        recordedAt: observation.createdAt,
      },
      scopeClass: acknowledged ? ("coordinate_seed" as const) : ("unavailable" as const),
      match: "unavailable" as const,
      listingMatches: new Map<string, string>(),
      qualityReason: "missing_observation_time" as MeasurementReason,
    };
  }
  const retained = projectRetainedBusinessObservation(observation),
    byItem = new Map(retained.items.map((value) => [value.itemId, value])),
    listingMatches = new Map<string, string>();
  const valid = decisions
    .filter((value) => value.recordedAt <= asOf)
    .map((value) => {
      const match = storedMatch(value),
        source = retained.sourceByItem.get(value.itemId),
        observed = byItem.get(value.itemId);
      const proof = value.evidence;
      const hash =
        proof && typeof proof === "object" && !Array.isArray(proof)
          ? proof.normalizedItemHash
          : null;
      if (
        !source ||
        !observed ||
        value.projectId !== item.projectId ||
        value.identityRevisionId !== identityRevisionId ||
        value.observationRunId !== observation.id ||
        value.decisionRevision !== 1 ||
        value.source !== "automatic" ||
        value.matcherVersion !== mapsBusinessMatcherVersion ||
        hash !== businessDigest(observed) ||
        businessDigest(source) !== businessDigest(match.observationSource) ||
        match.organicEligible !== organicEligibility(match)
      )
        throw new LocalResultUnavailableError();
      listingMatches.set(value.itemId, match.status);
      return match;
    });
  if (record.adapterVersion === MAPS_ADAPTER_VERSION && decisions.length !== retained.items.length)
    throw new LocalResultUnavailableError();
  const confirmed = valid.filter(
      (value) =>
        value.status === "confirmed" && value.matchedBy === "stable_id" && value.organicEligible,
    ),
    chosen = confirmed.length === 1 ? confirmed[0] : null;

  return {
    measurement: {
      ...empty,
      id: observation.id,
      execution: "completed" as const,
      position: chosen?.originalOrdinals.group ?? null,
      normalizationVersion: `${record.adapterVersion}:${mapsBusinessMatcherVersion}`,
      configuredScope: scope,
      effectiveScope: acknowledged ? scope : null,
      observedAt: policy.evidence.observedAt ? new Date(policy.evidence.observedAt) : null,
      recordedAt: observation.createdAt,
      requestedAt: policy.evidence.requestedAt ? new Date(policy.evidence.requestedAt) : null,
    },
    scopeClass: acknowledged ? ("coordinate_seed" as const) : ("unavailable" as const),
    match: chosen
      ? ("confirmed" as const)
      : valid.some((value) => value.status === "candidate")
        ? ("candidate" as const)
        : valid.some((value) => value.status === "rejected")
          ? ("rejected" as const)
          : ("unavailable" as const),
    listingMatches,
    qualityReason: null as MeasurementReason | null,
  };
}
