import { businessDigest } from "@/lib/business-location-store/canonical";
import { projectRetainedBusinessObservation } from "@/lib/business-location-store/observation-read";
import { matchBusinessCollection } from "@/lib/business-locations/match";
import { planCollectedMatch } from "@/lib/business-locations/match-decisions";
import { identifier, revision } from "@/lib/business-locations/test-fixtures";
import type { BusinessMatchDecision, Prisma } from "@/lib/generated/prisma/client";
import { buildMonitorDefinition } from "@/lib/local-monitor-store/definition";
import { monitorDefinitionFixture, monitorKeywordFixture } from "@/lib/local-monitor-store/fixture";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { projectLocalHostItem } from "@/lib/local-monitoring-host/projection";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import {
  MAPS_ADAPTER_VERSION,
  mapsTaskRequest,
} from "@/lib/providers/local-search/maps-capability";
import { parseMapsResult } from "@/lib/providers/local-search/maps-result";
import {
  mapsResultEnvelope,
  nativeIds,
  receiptTime,
} from "@/lib/providers/local-search/maps-test-fixtures";
import { settledRecord } from "@/lib/providers/local-search/test-fixtures";
import type { LocalResultBinding } from "./binding";
import type { ResultObservation } from "./evidence";
import type { LocalResultReceipt } from "./model";
export function resultObservation(
  row: LocalResultBinding["rows"][number],
  options: {
    rank?: number;
    weak?: boolean;
    promoted?: boolean;
    unsafe?: boolean;
    unacknowledged?: boolean;
  } = {},
) {
  const providerBinding = {
    target: row.target,
    point: row.point,
    keyword: {
      id: row.target.keywordId,
      revision: row.target.keywordRevision,
      text: row.keyword.text,
    },
    requestedAt: null,
  };
  const envelope = mapsResultEnvelope(),
    request = JSON.parse(String(mapsTaskRequest(providerBinding).body));
  envelope.tasks[0].data = {
    ...request[0],
    api: "serp",
    function: "task_get",
    se: "google",
    se_type: "maps",
  };
  envelope.tasks[0].result[0].keyword = row.keyword.text;
  const entry = envelope.tasks[0].result[0].items[0];
  entry.rank_group = options.rank ?? 1;
  if (options.rank !== undefined) envelope.tasks[0].result[0].items[2].rank_group = 9;
  const raw: Record<string, unknown> = entry;
  if (options.weak) {
    delete raw.cid;
    delete raw.place_id;
  }
  if (options.promoted) raw.type = "maps_paid_item";
  if (options.unsafe) raw.cid = 9007199254740994;
  if (options.unacknowledged) {
    const echo: Record<string, unknown> = envelope.tasks[0].data;
    delete echo.search_this_area;
  }
  const run = parseMapsResult(envelope, nativeIds[0], providerBinding, receiptTime);
  const observation: ResultObservation = {
    id: row.record.collectedEvidenceId ?? "missing",
    projectId: row.item.projectId,
    provider: run.provider,
    surface: run.surface,
    engine: run.engine,
    rankCheck: null,
    requestPolicy: {
      ...run.requestPolicy,
      localExecution: {
        version: 1,
        operationKey: row.record.key,
        targetKey: row.record.targetKey,
        acceptedTaskIdsHash: localDigest([...row.record.outcome!.taskIds].sort()),
        normalizedHash: localDigest(run),
      },
    } as unknown as Prisma.JsonObject,
    neutralExecutionItemId: row.item.id,
    executedAt: run.executedAt,
    createdAt: new Date("2026-10-12T11:59:00.000Z"),
    completeness: run.completeness,
    configuredScope: run.configuredScope,
    effectiveScope: run.effectiveScope ?? null,
    items: run.items.map((value, index) => ({
      id: `${row.item.id}-listing-${index}`,
      resultKind: value.resultKind,
      ordinal: index,
      rankAbsolute: value.rankAbsolute ?? null,
      blockPosition: value.blockPosition ?? null,
      positionInBlock: value.positionInBlock ?? null,
      rankGroup: value.rankGroup ?? null,
      rankScale: value.rankScale ?? null,
      promotion: value.promotion ?? null,
      rawFragment: value.rawFragment as Prisma.JsonValue,
      sourcePage: value.sourcePage ?? null,
      sourceBlockId: value.sourceBlockId ?? null,
      sourceOrdinal: value.sourceOrdinal ?? null,
      observedAt: value.observedAt ?? null,
      businessName: value.businessName ?? null,
      domain: value.domain ?? null,
      cid: value.cid ?? null,
      placeId: value.placeId ?? null,
    })),
  };
  const identity = {
    ...revision(),
    id: "identity-revision-1",
    projectId: row.item.projectId,
    snapshot: {
      ...revision().snapshot,
      name: row.keyword.text,
      identifiers: [
        identifier("cid", "9007199254740993123"),
        identifier("place_id", "OpaquePlace_A"),
      ],
    },
  };
  const retained = projectRetainedBusinessObservation(observation);
  const evaluations = matchBusinessCollection({
    projectId: row.item.projectId,
    observationRunId: observation.id,
    targets: [identity],
    items: retained.items,
  });
  const decisions: BusinessMatchDecision[] = evaluations.map((evaluation, index) => {
    const decision = planCollectedMatch({
        id: `decision-${row.item.id}-${index}`,
        evaluation,
        recordedAt: "2026-10-12T11:59:00.000Z",
      }),
      source = retained.sourceByItem.get(evaluation.itemId)!;
    return {
      id: decision.id,
      headId: `head-${evaluation.itemId}`,
      projectId: decision.projectId,
      entityId: decision.entityId,
      identityRevisionId: decision.identityRevisionId,
      observationRunId: decision.observationRunId,
      itemId: decision.itemId,
      decisionRevision: 1,
      previousDecisionId: null,
      status: decision.status,
      matchedBy: decision.matchedBy,
      reason: decision.reason,
      source: decision.source,
      confirmedBy: null,
      reviewReason: null,
      observedAt: new Date(decision.observedAt),
      recordedAt: new Date(decision.recordedAt),
      matcherVersion: decision.matcherVersion,
      evidence: {
        normalizedItemHash: businessDigest(retained.items[index]),
        originalOrdinals: decision.originalOrdinals,
        promotion: decision.promotion,
        localResult: decision.localResult,
        organicEligible: decision.organicEligible,
        evidenceIdentifierTypes: [...decision.evidenceIdentifierTypes],
        source,
      } as Prisma.JsonObject,
    };
  });
  return { run, observation, decisions, evaluations };
}
