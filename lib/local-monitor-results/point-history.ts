import "server-only";
import { businessReadProjectScope } from "@/lib/business-location-store/access";
import { prisma } from "@/lib/db/prisma";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { submissionRecordSchema } from "@/lib/local-monitoring-store/schema";
import { readHostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-snapshot";
import { resolveMeasurements } from "@/lib/rank-measurements/resolve";
import type { ReportCursorCodec } from "@/lib/rank-reports/cursor";
import { reportDigest } from "@/lib/rank-reports/digest";
import { readLocalResultBinding } from "./binding";
import { localResultCursorCodec } from "./cursor-host";
import {
  LocalResultCapacityError,
  LocalResultSnapshotConflictError,
  LocalResultUnavailableError,
} from "./errors";
import { localPointEvidence, resultObservationSelect } from "./evidence";
import { localFreshnessFromIntent } from "./freshness";
import type { LocalPointHistory } from "./model";
import {
  localHistoryTimeFilter,
  localHistoryWindow,
  localPointHistorySchema,
  localResultAsOf,
} from "./schema";
/** Exact original target identity only; changed geometry/keyword/policy is a named boundary. */
export async function readMonitorPointHistory(
  command: unknown,
  context: LocalStoreContext,
  options: { db?: LocalDatabase; now?: Date; codec?: ReportCursorCodec } = {},
): Promise<LocalPointHistory> {
  const input = localPointHistorySchema.parse(command),
    codec = options.codec ?? localResultCursorCodec(),
    cursor = input.cursor ? codec.decode(input.cursor) : null,
    asOf = localResultAsOf(cursor?.asOf ?? input.asOf, options.now ?? new Date()),
    window = localHistoryWindow(input, asOf),
    cursorBinding = reportDigest({
      purpose: "local-point-history-v1",
      projectId: input.projectId,
      monitorId: input.monitorId,
      runId: input.runId,
      targetId: input.targetId,
      window,
    });
  if (
    cursor &&
    (cursor.binding !== cursorBinding || (input.asOf !== undefined && input.asOf !== cursor.asOf))
  )
    throw new LocalResultUnavailableError();
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
        selected = binding.rows.find((row) => row.stored.publicId === input.targetId);
      if (!selected) throw new LocalResultUnavailableError();
      const where = {
        projectId: scope.project.id,
        monitorId: binding.occurrence.monitorId,
        createdAt: localHistoryTimeFilter(window),
      };
      const occurrenceCount = await tx.localMonitorOccurrence.count({ where });
      if (occurrenceCount > 1000) throw new LocalResultCapacityError();
      const occurrences = await tx.localMonitorOccurrence.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1000,
      });
      if (occurrences.length !== occurrenceCount) throw new LocalResultSnapshotConflictError();
      const items = await tx.localMeasurementRunItem.findMany({
        where: {
          projectId: scope.project.id,
          targetId: selected.stored.id,
          runId: { in: occurrences.map((row) => row.runId) },
          createdAt: { lte: asOf },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1001,
      });
      if (items.length > 1000) throw new LocalResultCapacityError();
      const policy = await readHostPolicySnapshot(tx, scope.project.id),
        source = reportDigest({
          policy,
          items: items.map((item) => ({
            id: item.id,
            runId: item.runId,
            version: item.version,
            at: item.createdAt.toISOString(),
            record: item.record,
          })),
        }),
        index = cursor
          ? items.findIndex(
              (item) =>
                item.id === cursor.last.id && item.createdAt.toISOString() === cursor.last.at,
            )
          : -1;
      if (cursor && cursor.source !== source) throw new LocalResultSnapshotConflictError();
      if (cursor && index < 0) throw new LocalResultUnavailableError();
      const page = items.slice(index + 1, index + 21),
        ids = page.flatMap((item) => {
          const record = submissionRecordSchema.parse(item.record);
          return record.collectedEvidenceId ? [record.collectedEvidenceId] : [];
        });
      const [runs, observations, decisions] = await Promise.all([
        tx.localMeasurementRun.findMany({
          where: { projectId: scope.project.id, id: { in: page.map((item) => item.runId) } },
          select: { id: true, publicId: true },
        }),
        tx.observationRun.findMany({
          where: { projectId: scope.project.id, id: { in: ids } },
          select: resultObservationSelect,
        }),
        tx.businessMatchDecision.findMany({
          where: {
            projectId: scope.project.id,
            entityId: binding.definition.entityId,
            identityRevisionId: binding.definition.identityRevisionId,
            observationRunId: { in: ids },
            decisionRevision: 1,
          },
        }),
      ]);
      if (observations.reduce((sum, row) => sum + row.items.length, 0) > 10000)
        throw new LocalResultCapacityError();
      const byRun = new Map(runs.map((row) => [row.id, row])),
        byObservation = new Map(observations.map((row) => [row.id, row])),
        byOccurrence = new Map(occurrences.map((row) => [row.runId, row])),
        intents =
          policy.state === "ready"
            ? await tx.localMonitorScheduleIntent.findMany({
                where: {
                  projectId: scope.project.id,
                  monitorId: binding.occurrence.monitorId,
                  id: {
                    in: page.flatMap(
                      (item) => byOccurrence.get(item.runId)?.scheduleIntentId ?? [],
                    ),
                  },
                },
              })
            : [],
        byIntent = new Map(intents.map((intent) => [intent.id, intent]));
      const entries = page.map<LocalPointHistory["items"][number]>((item) => {
        const run = byRun.get(item.runId),
          record = submissionRecordSchema.parse(item.record);
        if (
          !run ||
          record.targetKey !== selected.stored.targetKey ||
          record.key !== item.operationKey ||
          record.version !== item.version ||
          record.scope.projectId !== scope.project.id
        )
          throw new LocalResultUnavailableError();
        const proof = localPointEvidence(
          { ...selected, item, record },
          record.collectedEvidenceId
            ? (byObservation.get(record.collectedEvidenceId) ?? null)
            : null,
          decisions.filter((row) => row.observationRunId === record.collectedEvidenceId),
          binding.definition.identityRevisionId,
          asOf,
        );
        const occurrence = byOccurrence.get(item.runId);
        if (!occurrence) throw new LocalResultUnavailableError();
        const freshness = localFreshnessFromIntent(
            { ...binding, occurrence },
            byIntent.get(occurrence.scheduleIntentId) ?? null,
            policy,
            asOf,
          ),
          current = resolveMeasurements([proof.measurement], {
            asOf,
            horizon: Math.min(3, selected.target.cutoff),
            freshForMs: freshness.freshForMs,
            expectedScope: proof.measurement.configuredScope,
            baselineEnabled: false,
          }).current;
        return {
          id: item.id,
          runId: run.publicId,
          createdAt: item.createdAt.toISOString(),
          observedAt: current?.measurement.observedAt?.toISOString() ?? null,
          position: current?.evidence === "positive" ? current.position : null,
          evidence: current?.evidence ?? "unknown",
          reason: current ? current.reason : "not_completed",
          freshness: current?.freshness ?? "unknown",
          freshnessReason:
            current?.freshnessReason === "policy_unavailable"
              ? freshness.freshnessReason
              : (current?.freshnessReason ?? freshness.freshnessReason),
        };
      });
      const hasMore = index + 1 + page.length < items.length,
        last = page.at(-1);
      return {
        version: 1,
        asOf: asOf.toISOString(),
        targetId: input.targetId,
        scope: "exact_captured_target",
        limit: 20,
        hasMore,
        window,
        eligibleTotal: items.length,
        policyEpoch: policy.policyEpoch,
        freshnessConfigurationRevision: policy.config?.freshness.configurationRevision ?? null,
        nextCursor:
          hasMore && last
            ? codec.encode({
                version: 1,
                asOf: asOf.toISOString(),
                binding: cursorBinding,
                source,
                last: { id: last.id, at: last.createdAt.toISOString() },
              })
            : null,
        items: entries,
      } satisfies LocalPointHistory;
    },
    { isolationLevel: "RepeatableRead" },
  );
}
