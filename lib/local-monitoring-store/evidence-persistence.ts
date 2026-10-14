import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import type { LocalEvidencePort } from "@/lib/local-monitoring/execution-types";
import { applySubmissionEvent } from "@/lib/local-monitoring/submission-state";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { projectionFingerprint } from "@/lib/observation/projection-fingerprint";
import { localDigest } from "./canonical";
import type { LocalDatabase } from "./context";
import { assertLocalContinuationLease, type LocalContinuationLease } from "./continuation-lease";
import { assertLocalCustody } from "./custody";
import { LocalMeasurementConflictError } from "./errors";
import { assertLocalObservationProof } from "./evidence-proof";
import type { LocalNormalizationPort } from "./evidence-types";
import { releaseProvenLocalOwner } from "./ownership";
import { retainedLocalPoint } from "./point";
import { lockedLocalItem } from "./repository";
import { executionTargetSchema, submissionRecordSchema } from "./schema";

export function neutralLocalEvidencePort(
  db: LocalDatabase,
  lease: LocalContinuationLease,
  normalizer: LocalNormalizationPort,
  clock: () => Date,
): LocalEvidencePort {
  return {
    async persist({ record: received, result }) {
      const target = await db.localMeasurementTarget.findFirst({
        where: { id: lease.targetId, projectId: lease.projectId },
      });
      if (!target) throw new LocalMeasurementConflictError();
      const point = await db.localMeasurementPoint.findFirst({
        where: { id: target.pointId, projectId: lease.projectId },
      });
      if (!point) throw new LocalMeasurementConflictError();
      const frozenTarget = executionTargetSchema.parse(target.target);
      const frozenPoint = retainedLocalPoint(point.point);
      if (
        executionTargetKey(frozenTarget) !== received.targetKey ||
        frozenTarget.pointRevision !== frozenPoint.revisionKey
      )
        throw new LocalMeasurementConflictError();
      const normalized = await normalizer.normalize({
        record: received,
        result,
        target: frozenTarget,
        point: frozenPoint,
      });
      assertLocalObservationProof(normalized, received, result, frozenTarget, frozenPoint);
      const projectionHash = projectionFingerprint({
        ...normalized,
        items: normalized.items.map(({ rawFragment: _raw, ...value }) => value),
      });
      const proof = {
        version: 1,
        operationKey: received.key,
        targetKey: received.targetKey,
        acceptedTaskIdsHash: localDigest([...result.taskIds].sort()),
        normalizedHash: localDigest(normalized),
      };
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE id=${lease.projectId} FOR UPDATE`;
        const { item, record } = await lockedLocalItem(tx, lease.projectId, lease.key);
        if (
          item.id !== lease.itemId ||
          item.runId !== lease.runId ||
          item.targetId !== lease.targetId ||
          record.key !== received.key ||
          !record.attemptId ||
          !record.outcome ||
          !record.settlementRecorded ||
          localDigest([...record.outcome.taskIds].sort()) !==
            localDigest([...result.taskIds].sort())
        )
          throw new LocalMeasurementConflictError();
        await assertLocalCustody(tx, item, record);
        const existing = await tx.observationRun.findFirst({
          where: { projectId: lease.projectId, neutralExecutionItemId: item.id },
        });
        if (existing) {
          const policy = existing.requestPolicy;
          if (!policy || typeof policy !== "object" || Array.isArray(policy))
            throw new LocalMeasurementConflictError();
          const retained = policy.localExecution;
          const historical =
            retained && typeof retained === "object" && !Array.isArray(retained) ? retained : null;
          const normalizedMatches =
            policy.projectionHash === projectionHash ||
            (policy.projectionHash === undefined &&
              historical?.normalizedHash === proof.normalizedHash);
          const taskHashes = [
            proof.acceptedTaskIdsHash,
            localDigest(result.taskIds),
            localDigest(record.originalOutcome?.taskIds ?? record.outcome.taskIds),
          ];
          const acceptedHash = historical?.acceptedTaskIdsHash;
          if (
            !normalizedMatches ||
            (acceptedHash !== undefined &&
              (typeof acceptedHash !== "string" || !taskHashes.includes(acceptedHash)))
          )
            throw new Error("Neutral observation replay changed its immutable projection.");
          await normalizer.afterPersist?.({
            tx,
            item,
            record,
            observationId: existing.id,
            target: frozenTarget,
            point: frozenPoint,
            replay: true,
            now: clock(),
          });
          return { evidenceId: existing.id };
        }
        await assertLocalContinuationLease(tx, lease, clock());
        const requestPolicy = {
          ...normalized.requestPolicy,
          projectionHash,
          localExecution: proof,
        };
        const observation = await tx.observationRun.create({
          data: {
            projectId: lease.projectId,
            rankCheckId: null,
            neutralExecutionItemId: item.id,
            provider: normalized.provider,
            surface: normalized.surface,
            engine: normalized.engine,
            requestPolicy: requestPolicy as Prisma.InputJsonValue,
            completeness: normalized.completeness,
            configuredScope: normalized.configuredScope as Prisma.InputJsonValue,
            effectiveScope: normalized.effectiveScope ?? Prisma.DbNull,
            executedAt: normalized.executedAt,
          },
        });
        if (normalized.items.length)
          await tx.observationItem.createMany({
            data: normalized.items.map((value, ordinal) => ({
              observationRunId: observation.id,
              resultKind: value.resultKind,
              ordinal,
              rankScale: value.rankScale,
              promotion: value.promotion,
              sourcePage: value.sourcePage,
              sourceBlockId: value.sourceBlockId,
              sourceOrdinal: value.sourceOrdinal,
              observedAt: value.observedAt,
              rankGroup: value.rankGroup,
              rankAbsolute: value.rankAbsolute,
              blockPosition: value.blockPosition,
              positionInBlock: value.positionInBlock,
              title: value.title,
              url: value.url,
              domain: value.domain,
              businessName: value.businessName,
              placeId: value.placeId,
              cid: value.cid,
              mapsUrl: value.mapsUrl,
              rating: value.rating ?? Prisma.DbNull,
              rawFragment:
                value.rawFragment == null
                  ? Prisma.JsonNull
                  : (value.rawFragment as Prisma.InputJsonValue),
            })),
          });
        await normalizer.afterPersist?.({
          tx,
          item,
          record,
          observationId: observation.id,
          target: frozenTarget,
          point: frozenPoint,
          replay: false,
          now: clock(),
        });
        const next = submissionRecordSchema.parse(
          applySubmissionEvent(record, {
            kind: "collected",
            attemptId: record.attemptId,
            evidenceId: observation.id,
          }),
        );
        const changed = await tx.localMeasurementRunItem.updateMany({
          where: { id: item.id, version: record.version },
          data: { record: next as Prisma.InputJsonValue, version: next.version },
        });
        if (changed.count !== 1) throw new LocalMeasurementConflictError();
        await releaseProvenLocalOwner(tx, item, next);
        return { evidenceId: observation.id };
      });
    },
  };
}
