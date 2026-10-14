import "server-only";
import { businessReadProjectScope } from "@/lib/business-location-store/access";
import { prisma } from "@/lib/db/prisma";
import { readLocalHostRunInTransaction } from "@/lib/local-monitoring-host/read-transaction";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { readLocalResultBinding } from "./binding";
import { LocalResultCapacityError, LocalResultUnavailableError } from "./errors";
import { localPointEvidence, resultObservationSelect } from "./evidence";
import { readLocalRunFreshness } from "./freshness";
import type { LocalMonitorRunResult, LocalResultListing } from "./model";
import { projectLocalRun } from "./projection";
import { localPointReadSchema, localResultAsOf, localResultReadSchema } from "./schema";

const ITEMS_LIMIT = 10000;
/** Fresh entity-match access plus one repeatable read snapshot; no provider, scheduler or evidence writes. */
export async function readMonitorRunResult(
  command: unknown,
  context: LocalStoreContext,
  options: { db?: LocalDatabase; now?: Date } = {},
): Promise<LocalMonitorRunResult> {
  const input = localResultReadSchema.parse(command),
    asOf = localResultAsOf(input.asOf, options.now ?? new Date());
  return (options.db ?? prisma).$transaction(
    async (tx) => {
      const scope = await localProjectScope(tx, context, input.projectId, "read");
      await businessReadProjectScope(tx, context, input.projectId, "entity_match");
      const binding = await readLocalResultBinding(
        tx,
        scope.project.id,
        input.monitorId,
        input.runId,
        asOf,
      );
      const observationIds = binding.rows.flatMap((row) =>
        row.record.collectedEvidenceId ? [row.record.collectedEvidenceId] : [],
      );
      const count = await tx.observationItem.count({
        where: { observationRunId: { in: observationIds } },
      });
      if (count > ITEMS_LIMIT) throw new LocalResultCapacityError();
      const observations = await tx.observationRun.findMany({
        where: { projectId: scope.project.id, id: { in: observationIds } },
        select: resultObservationSelect,
      });
      if (observations.reduce((sum, row) => sum + row.items.length, 0) !== count)
        throw new LocalResultUnavailableError();
      const decisions = await tx.businessMatchDecision.findMany({
        where: {
          projectId: scope.project.id,
          entityId: binding.definition.entityId,
          identityRevisionId: binding.definition.identityRevisionId,
          observationRunId: { in: observationIds },
          decisionRevision: 1,
        },
      });
      const byObservation = new Map(observations.map((row) => [row.id, row]));
      const evidence = new Map(
        binding.rows.map((row) => [
          row.item.id,
          localPointEvidence(
            row,
            row.record.collectedEvidenceId
              ? (byObservation.get(row.record.collectedEvidenceId) ?? null)
              : null,
            decisions.filter(
              (decision) => decision.observationRunId === row.record.collectedEvidenceId,
            ),
            binding.definition.identityRevisionId,
            asOf,
          ),
        ]),
      );
      const receipt = await readLocalHostRunInTransaction(
        tx,
        { projectId: input.projectId, runId: input.runId },
        scope,
      );
      const freshnessPolicy = await readLocalRunFreshness(tx, binding, asOf),
        projection = projectLocalRun(binding, evidence, receipt, asOf, freshnessPolicy);
      const identity = await tx.businessIdentityRevision.findFirst({
        where: {
          projectId: scope.project.id,
          entityId: binding.definition.entityId,
          id: binding.definition.identityRevisionId,
        },
        select: { snapshot: true },
      });
      if (!identity) throw new LocalResultUnavailableError();
      const snapshot = identity.snapshot;
      const subject =
        snapshot &&
        typeof snapshot === "object" &&
        !Array.isArray(snapshot) &&
        typeof snapshot.name === "string"
          ? snapshot.name
          : null;
      if (!subject) throw new LocalResultUnavailableError();
      return {
        version: 1,
        projectId: input.projectId,
        monitorId: input.monitorId,
        runId: input.runId,
        asOf: asOf.toISOString(),
        createdAt: binding.run.createdAt.toISOString(),
        definitionRevisionId: binding.revision.id,
        definitionRevision: binding.revision.revision,
        identityRevisionId: binding.definition.identityRevisionId,
        subject,
        protocol: {
          geometry: binding.definition.grid.geometryModel,
          matcher: "business-match-maps-v1",
          normalizerVersions: [...new Set(binding.rows.map((row) => row.record.adapterVersion))],
          metricDefinition: "sampled-grid-top-n-v1",
        },
        financialBasis: "current_accounting_state",
        freshnessPolicy,
        receipt,
        ...projection,
      } satisfies LocalMonitorRunResult;
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function readMonitorPointListings(
  command: unknown,
  context: LocalStoreContext,
  options: { db?: LocalDatabase; now?: Date } = {},
): Promise<readonly LocalResultListing[]> {
  const input = localPointReadSchema.parse(command),
    asOf = localResultAsOf(input.asOf, options.now ?? new Date());
  return (options.db ?? prisma).$transaction(
    async (tx) => {
      const scope = await localProjectScope(tx, context, input.projectId, "read");
      await businessReadProjectScope(tx, context, input.projectId, "entity_match");
      const binding = await readLocalResultBinding(
          tx,
          scope.project.id,
          input.monitorId,
          input.runId,
          asOf,
        ),
        row = binding.rows.find((value) => value.stored.publicId === input.targetId);
      if (!row) throw new LocalResultUnavailableError();
      if (!row.record.collectedEvidenceId) return [];
      const observation = await tx.observationRun.findFirst({
        where: { projectId: scope.project.id, id: row.record.collectedEvidenceId },
        select: resultObservationSelect,
      });
      if (!observation || observation.createdAt > asOf) return [];
      if (observation.items.length > 700) throw new LocalResultCapacityError();
      const decisions = await tx.businessMatchDecision.findMany({
        where: {
          projectId: scope.project.id,
          entityId: binding.definition.entityId,
          identityRevisionId: binding.definition.identityRevisionId,
          observationRunId: observation.id,
          decisionRevision: 1,
        },
      });
      const proof = localPointEvidence(
        row,
        observation,
        decisions,
        binding.definition.identityRevisionId,
        asOf,
      );
      return observation.items
        .filter((item) => !item.observedAt || item.observedAt <= asOf)
        .map<LocalResultListing>((item) => ({
          id: item.id,
          name: item.businessName,
          rankGroup: item.rankGroup,
          rankAbsolute: item.rankAbsolute,
          promotion:
            item.promotion === "organic"
              ? "organic"
              : item.promotion === "promoted"
                ? "promoted"
                : "unknown",
          observedAt: item.observedAt?.toISOString() ?? null,
          cid: item.cid,
          placeId: item.placeId,
          sourcePage: item.sourcePage,
          sourceBlockId: item.sourceBlockId,
          sourceOrdinal: item.sourceOrdinal,
          rankScale: item.rankScale,
          matched:
            proof.listingMatches.get(item.id) === "confirmed"
              ? "confirmed"
              : proof.listingMatches.get(item.id) === "candidate"
                ? "candidate"
                : proof.listingMatches.get(item.id) === "rejected"
                  ? "rejected"
                  : "unavailable",
        }));
    },
    { isolationLevel: "RepeatableRead" },
  );
}
