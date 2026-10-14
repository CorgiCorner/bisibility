import "server-only";
import { randomUUID } from "node:crypto";
import { businessDigest } from "@/lib/business-location-store/canonical";
import {
  loadProjectLocations,
  storedIdentity,
} from "@/lib/business-location-store/location-repository";
import {
  appendStoredMatch,
  readMatchHeads,
  storedMatch,
} from "@/lib/business-location-store/match-repository";
import {
  projectRetainedBusinessObservation,
  retainedBusinessObservationSelect,
} from "@/lib/business-location-store/observation-read";
import { mapsBusinessMatcherVersion } from "@/lib/business-locations/dto";
import { matchBusinessCollection } from "@/lib/business-locations/match";
import { planCollectedMatch } from "@/lib/business-locations/match-decisions";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { localDigest, localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import type { LocalNormalizationPort } from "@/lib/local-monitoring-store/evidence-types";
import { readOccurrenceDefinition } from "@/lib/local-monitoring-store/occurrence-definition";
import { unknownLocalObservationTime } from "@/lib/local-monitoring-store/unknown-observation-time";
import { MAPS_ADAPTER_VERSION } from "@/lib/providers/local-search/maps-capability";
/** Runs only under the original collector's project/item locks, custody and lease checks. */
export const retainMapsCollectionMatch: NonNullable<
  LocalNormalizationPort["afterPersist"]
> = async ({ tx, item, record, observationId, target, point, replay, now }) => {
  const { definition } = await readOccurrenceDefinition(tx, item.projectId, item.runId);
  const keyword = definition.keywords.find((value) => value.id === target.keywordId),
    gridPoint = definition.grid.points.find(
      (value) => value.point.revisionKey === target.pointRevision,
    );
  if (
    !keyword ||
    !gridPoint ||
    record.targetKey !== executionTargetKey(target) ||
    target.projectId !== item.projectId ||
    localDigest(point) !== localDigest(gridPoint.point) ||
    localDigest(target) !==
      localDigest({
        version: 1,
        projectId: item.projectId,
        keywordId: keyword.id,
        keywordRevision: localKeywordRevision(keyword),
        pointRevision: point.revisionKey,
        policyRevision: definition.grid.revisionId,
        ...definition.axes,
      })
  )
    throw new Error("Captured Maps monitor target changed.");
  const original = await tx.observationRun.findFirst({
    where: { id: observationId, projectId: item.projectId, neutralExecutionItemId: item.id },
    select: { ...retainedBusinessObservationSelect, neutralExecutionItemId: true },
  });
  if (!original) throw new Error("Original Maps observation is unavailable.");
  if (unknownLocalObservationTime(original, record, item.id, target)) {
    const decisions = await tx.businessMatchDecision.count({
      where: {
        projectId: item.projectId,
        entityId: definition.entityId,
        observationRunId: observationId,
      },
    });
    const heads = await tx.businessMatchHead.count({
      where: {
        projectId: item.projectId,
        entityId: definition.entityId,
        observationRunId: observationId,
      },
    });
    if (decisions || heads)
      throw new Error("An unknown-time Maps observation cannot contain timestamped matches.");
    return;
  }
  const retained = projectRetainedBusinessObservation(original);
  const items = new Map(retained.items.map((value) => [value.itemId, value]));
  const existing = await readMatchHeads(tx, item.projectId, definition.entityId, observationId, [
    ...items.keys(),
  ]);
  if (replay) {
    // Legacy v1 observations existed before match capture. Their geography remains unknown.
    if (record.adapterVersion !== MAPS_ADAPTER_VERSION && existing.size === 0) return;
    const originals = await tx.businessMatchDecision.findMany({
      where: {
        projectId: item.projectId,
        entityId: definition.entityId,
        observationRunId: observationId,
        decisionRevision: 1,
      },
    });
    const byItem = new Map(
      originals.map((row) => [row.itemId, { row, decision: storedMatch(row) }]),
    );
    if (byItem.size !== retained.items.length)
      throw new Error("Recorded Maps match membership changed.");
    for (const value of retained.items) {
      const original = byItem.get(value.itemId),
        source = retained.sourceByItem.get(value.itemId);
      const proof = original?.row.evidence;
      const hash =
        proof && typeof proof === "object" && !Array.isArray(proof)
          ? proof.normalizedItemHash
          : null;
      if (
        !original ||
        !source ||
        original.decision.source !== "automatic" ||
        original.decision.identityRevisionId !== definition.identityRevisionId ||
        original.decision.matcherVersion !== mapsBusinessMatcherVersion ||
        hash !== businessDigest(value) ||
        businessDigest(original.decision.observationSource) !== businessDigest(source)
      )
        throw new Error("Recorded Maps match authority changed.");
    }
    return;
  }
  if (existing.size) throw new Error("Original Maps match decisions already exist.");
  const captured = await tx.businessIdentityRevision.findFirst({
    where: {
      projectId: item.projectId,
      entityId: definition.entityId,
      id: definition.identityRevisionId,
    },
  });
  if (!captured) throw new Error("Captured Maps identity is unavailable.");
  if ((await tx.businessLocation.count({ where: { projectId: item.projectId } })) > 1000)
    throw new RangeError("Captured business registry exceeds the bounded match limit.");
  const registry = await loadProjectLocations(tx, item.projectId, false);
  if (!registry.some((value) => value.id === definition.entityId))
    throw new Error("Captured Maps entity is unavailable.");
  const targets = registry.map((value) =>
    value.id === definition.entityId ? storedIdentity(captured) : value.currentRevision,
  );
  const evaluations = matchBusinessCollection({
    projectId: item.projectId,
    observationRunId: observationId,
    targets,
    items: retained.items,
    targetEntityIds: [definition.entityId],
  }).filter((value) => value.entityId === definition.entityId);
  for (const evaluation of evaluations) {
    const source = retained.sourceByItem.get(evaluation.itemId),
      value = items.get(evaluation.itemId);
    if (!source || !value) throw new Error("Recorded Maps item is unavailable.");
    const head = await tx.businessMatchHead.create({
      data: {
        projectId: item.projectId,
        entityId: definition.entityId,
        observationRunId: observationId,
        itemId: evaluation.itemId,
      },
    });
    const decision = planCollectedMatch({
      id: randomUUID(),
      evaluation,
      recordedAt: now.toISOString(),
    });
    await appendStoredMatch(tx, head, decision, source, businessDigest(value));
  }
};
