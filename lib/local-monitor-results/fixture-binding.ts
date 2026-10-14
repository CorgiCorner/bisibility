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
import { localDigest, localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
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
export function localResultFixture(size: 1 | 3 | 5 = 1) {
  const definition = buildMonitorDefinition(
    {
      ...monitorDefinitionFixture,
      grid: { latitude: "52", longitude: "-21", size, spacingMetres: 100 },
      axes: { ...monitorDefinitionFixture.axes, operatingSystem: "windows" },
    },
    { entityId: "entity_a", keywords: [monitorKeywordFixture], revisionId: "definition-r1" },
  );
  const projectId = "synthetic-project",
    runId = "synthetic-run",
    createdAt = new Date("2026-10-12T11:00:00.000Z");
  const rows: LocalResultBinding["rows"] = definition.grid.points.map((gridPoint, index) => {
    const point = gridPoint.point,
      target = {
        version: 1 as const,
        projectId,
        keywordId: monitorKeywordFixture.id,
        keywordRevision: localKeywordRevision(monitorKeywordFixture),
        pointRevision: point.revisionKey,
        policyRevision: definition.grid.revisionId,
        ...definition.axes,
      };
    const record = {
      ...settledRecord({
        target,
        point,
        keyword: {
          id: target.keywordId,
          revision: target.keywordRevision,
          text: monitorKeywordFixture.text,
        },
        requestedAt: null,
      }),
      adapterVersion: MAPS_ADAPTER_VERSION,
      collectedEvidenceId: `observation-${index}`,
    };
    const stored = {
      id: `target-${index}`,
      publicId: `lmt_${String(index).padStart(24, "a")}`,
      projectId,
      keywordId: target.keywordId,
      pointId: `point-${index}`,
      targetKey: executionTargetKey(target),
      target: target as Prisma.JsonObject,
      keywordSnapshot: {},
      keywordSourceHash: monitorKeywordFixture.sourceHash,
      actorId: null,
      createdAt,
    };
    const item = {
      id: `item-${index}`,
      projectId,
      runId,
      targetId: stored.id,
      operationKey: record.key,
      bodyHash: "a".repeat(64),
      record: record as unknown as Prisma.JsonObject,
      version: record.version,
      connectionId: "connection",
      provider: "dataforseo",
      credentialVersion: "version",
      correlationId: `correlation-${index}`,
      namespace: "default",
      preparedAttemptId: null,
      preparedLeaseId: null,
      requestHash: null,
      createdAt,
      updatedAt: createdAt,
    };
    return { item, target, point, record, stored, keyword: monitorKeywordFixture, gridPoint };
  });
  const binding: LocalResultBinding = {
    definition,
    occurrence: {
      id: "occurrence",
      projectId,
      monitorId: "monitor",
      definitionRevisionId: definition.grid.revisionId,
      scheduleIntentId: "intent",
      monitorVersion: 1,
      actorId: null,
      mode: "manual",
      keyHash: "a".repeat(64),
      bodyHash: "a".repeat(64),
      quoteHash: "a".repeat(64),
      runId,
      createdAt,
    },
    revision: {
      id: definition.grid.revisionId,
      projectId,
      monitorId: "monitor",
      previousRevisionId: null,
      revision: 1,
      entityId: definition.entityId,
      identityRevisionId: definition.identityRevisionId,
      gridRevisionKey: definition.grid.revisionKey,
      contentHash: localDigest(definition),
      snapshot: definition as unknown as Prisma.JsonObject,
      actorId: null,
      createdAt,
    },
    run: {
      id: runId,
      publicId: "lmr_abcdefghijklmnopqrstuvwx",
      projectId,
      operation: "local_scan_submit",
      keyHash: "a".repeat(64),
      bodyHash: "a".repeat(64),
      actorId: null,
      quote: {},
      quoteHash: "a".repeat(64),
      expectedTargetKeys: rows.map((row) => row.stored.targetKey),
      source: "app",
      trigger: "manual",
      cancellationRequested: false,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    rows,
  };
  const receipt: LocalResultReceipt = {
    id: binding.run.publicId,
    version: 1,
    cancellationRequested: false,
    expectedCount: rows.length,
    items: rows.map((row) => ({
      targetId: row.stored.publicId,
      ...projectLocalHostItem(row.record, "settled", false),
    })),
    counts: {
      items: rows.length,
      complete: rows.length,
      acceptanceUnresolved: 0,
      accountingPending: 0,
      unavailable: 0,
      retainedOwners: 0,
    },
  };
  return { binding, receipt, now: receiptTime };
}
