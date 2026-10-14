import { requirePublicId } from "@/lib/db/public-id-resources";
import "server-only";
import { randomUUID } from "node:crypto";
import { matchBusinessCollection } from "@/lib/business-locations/match";
import { planAutomaticMatch, planCandidateReview } from "@/lib/business-locations/match-decisions";
import { type BusinessProjectScope, businessWriteContext } from "./access";
import { businessDigest } from "./canonical";
import type { BusinessDatabase, BusinessStoreContext, BusinessTransaction } from "./context";
import { BusinessLocationConflictError, BusinessLocationUnavailableError } from "./errors";
import { assertItemConfirmationAvailable } from "./item-confirmation";
import { loadBusinessLocation, loadProjectLocations } from "./location-repository";
import {
  appendStoredMatch,
  type MatchReplayProvenance,
  matchReplayProvenanceSchema,
  readMatchHeads,
} from "./match-repository";
import { mutateBusiness } from "./mutation";
import { loadRetainedBusinessObservation } from "./observation-read";
import { rematchLocationSchema, reviewMatchSchema } from "./schema";

export type RetainedRematchGuard = Readonly<{
  provenance: MatchReplayProvenance;
  assertReplay: (tx: BusinessTransaction, scope: BusinessProjectScope) => Promise<void>;
}>;
export async function rematchBusinessLocationFor(
  input: unknown,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
  guard?: RetainedRematchGuard,
) {
  const provenance = guard ? matchReplayProvenanceSchema.parse(guard.provenance) : undefined;
  const parsed = rematchLocationSchema.parse(input);
  const data = {
    ...parsed,
    expectedDecisions: [...parsed.expectedDecisions].sort((a, b) =>
      a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0,
    ),
  };
  return mutateBusiness({
    data,
    context,
    db,
    operation: "rematch_location",
    assertReplay: guard?.assertReplay,
    retainedEvidence: provenance,
    resource: "entity_match",
    async execute(tx, scope, now) {
      const { row, location } = await loadBusinessLocation(tx, scope.project.id, data.locationId);
      if (row.state !== "active" || location.currentRevision.id !== data.identityRevisionId)
        throw new BusinessLocationConflictError();
      const retained = await loadRetainedBusinessObservation(
        tx,
        scope.project.id,
        data.observationRunId,
      );
      const items = new Map(retained.items.map((item) => [item.itemId, item]));
      if (data.expectedDecisions.some(({ itemId }) => !items.has(itemId)))
        throw new BusinessLocationUnavailableError();
      const registry = await loadProjectLocations(tx, scope.project.id, true);
      const evaluations = matchBusinessCollection({
        projectId: scope.project.id,
        observationRunId: data.observationRunId,
        targets: registry.map(({ currentRevision }) => currentRevision),
        items: retained.items,
      });
      const byItem = new Map(
        evaluations
          .filter(({ entityId }) => entityId === row.id)
          .map((evaluation) => [evaluation.itemId, evaluation]),
      );
      const existing = await readMatchHeads(
        tx,
        scope.project.id,
        row.id,
        data.observationRunId,
        data.expectedDecisions.map(({ itemId }) => itemId),
      );
      const decisions: string[] = [];
      for (const expected of data.expectedDecisions) {
        const current = existing.get(expected.itemId);
        if ((current?.head.version ?? 0) !== expected.expectedRevision)
          throw new BusinessLocationConflictError();
        const evaluation = byItem.get(expected.itemId);
        if (!evaluation) throw new BusinessLocationUnavailableError();
        const head =
          current?.head ??
          (await tx.businessMatchHead.create({
            data: {
              projectId: scope.project.id,
              entityId: row.id,
              observationRunId: data.observationRunId,
              itemId: expected.itemId,
            },
          }));
        const planned = planAutomaticMatch({
          id: randomUUID(),
          evaluation,
          current: current?.current ?? null,
          expectedDecisionRevision: expected.expectedRevision,
          context: businessWriteContext(scope),
          recordedAt: now.toISOString(),
          idempotencyKey: data.idempotencyKey,
        });
        // Explicit evidence replay cannot create an original automatic KPI decision.
        const decision = provenance
          ? { ...planned.decision, source: "rematch" as const }
          : planned.decision;
        if (decision.status === "confirmed")
          await assertItemConfirmationAvailable(tx, {
            projectId: scope.project.id,
            entityId: row.id,
            observationRunId: data.observationRunId,
            itemId: expected.itemId,
          });
        const source = retained.sourceByItem.get(expected.itemId);
        if (!source) throw new BusinessLocationUnavailableError();
        await appendStoredMatch(
          tx,
          head,
          decision,
          source,
          businessDigest(items.get(expected.itemId)),
          provenance,
        );
        decisions.push(decision.id);
      }
      return {
        receipt: {
          kind: "match",
          entityId: row.id,
          publicId: requirePublicId(row.publicId, "biz"),
          decisionIds: decisions,
        },
        audit: {
          action: "entity_match.rematch",
          targetType: "entity_match",
          targetId: row.publicId,
          after: {
            operation: "rematch",
            changedCount: decisions.length,
            revisionId: data.identityRevisionId,
          },
        },
      };
    },
  });
}

export async function reviewBusinessCandidateFor(
  input: unknown,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  const data = reviewMatchSchema.parse(input);
  return mutateBusiness({
    data,
    context,
    db,
    operation: "review_match",
    resource: "entity_match",
    async execute(tx, scope, now) {
      const { row, location } = await loadBusinessLocation(tx, scope.project.id, data.locationId);
      if (row.state !== "active" || location.currentRevision.id !== data.identityRevisionId)
        throw new BusinessLocationConflictError();
      const retained = await loadRetainedBusinessObservation(
        tx,
        scope.project.id,
        data.observationRunId,
      );
      const item = retained.items.find(({ itemId }) => itemId === data.itemId);
      if (!item) throw new BusinessLocationUnavailableError();
      const existing = (
        await readMatchHeads(tx, scope.project.id, row.id, data.observationRunId, [data.itemId])
      ).get(data.itemId);
      if (
        !existing?.current ||
        existing.current.id !== data.decisionId ||
        existing.head.version !== data.expectedDecisionRevision
      )
        throw new BusinessLocationConflictError();
      const source = retained.sourceByItem.get(data.itemId);
      if (!source) throw new BusinessLocationUnavailableError();
      if (
        businessDigest(source) !== businessDigest(existing.source) ||
        businessDigest(item) !== existing.normalizedItemHash
      )
        throw new BusinessLocationConflictError();
      const registry = await loadProjectLocations(tx, scope.project.id, true);
      const fresh = matchBusinessCollection({
        projectId: scope.project.id,
        observationRunId: data.observationRunId,
        targets: registry.map(({ currentRevision }) => currentRevision),
        items: retained.items,
      }).find((evaluation) => evaluation.entityId === row.id && evaluation.itemId === data.itemId);
      if (!fresh) throw new BusinessLocationUnavailableError();
      // Registry changes can invalidate a stored weak candidate even without an own identity edit.
      if (data.action === "confirm" && fresh.status !== "candidate")
        throw new BusinessLocationConflictError();
      const planned = planCandidateReview({
        id: randomUUID(),
        current: existing.current,
        context: businessWriteContext(scope),
        currentIdentityRevisionId: location.currentRevision.id,
        entityState: location.state,
        recordedAt: now.toISOString(),
        idempotencyKey: data.idempotencyKey,
        intent: {
          action: data.action,
          decisionId: data.decisionId,
          expectedDecisionRevision: data.expectedDecisionRevision,
          identityRevisionId: data.identityRevisionId,
          entityId: row.id,
          observationRunId: data.observationRunId,
          itemId: data.itemId,
          reason: data.reason,
        },
      });
      if (planned.decision.status === "confirmed")
        await assertItemConfirmationAvailable(tx, {
          projectId: scope.project.id,
          entityId: row.id,
          observationRunId: data.observationRunId,
          itemId: data.itemId,
        });
      await appendStoredMatch(tx, existing.head, planned.decision, source, businessDigest(item));
      return {
        receipt: {
          kind: "match",
          entityId: row.id,
          publicId: requirePublicId(row.publicId, "biz"),
          decisionIds: [planned.decision.id],
        },
        audit: {
          action: data.action === "confirm" ? "entity_match.confirm" : "entity_match.reject",
          targetType: "entity_match",
          targetId: row.publicId,
          after: {
            operation: data.action,
            revisionId: planned.decision.id,
            previousId: planned.decision.previousDecisionId,
            decisionRevision: planned.decision.decisionRevision,
          },
        },
      };
    },
  });
}
