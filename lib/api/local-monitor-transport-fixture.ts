import type { LocalMonitorScheduleIntent } from "@/lib/generated/prisma/client";
import { localPointEvidence } from "@/lib/local-monitor-results/evidence";
import { localResultFixture, resultObservation } from "@/lib/local-monitor-results/fixture";
import { localFreshnessFromIntent } from "@/lib/local-monitor-results/freshness";
import type {
  LocalMonitorRunHistory,
  LocalMonitorRunResult,
  LocalPointHistory,
  LocalResultListing,
} from "@/lib/local-monitor-results/model";
import { projectLocalRun } from "@/lib/local-monitor-results/projection";
import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import type { LocalMonitorApiReaders } from "./local-monitor-results";

export const localTransportIds = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  monitorId: "lmn_abcdefghijklmnopqrstuvwx",
  runId: "lmr_abcdefghijklmnopqrstuvwx",
};

/** Synthetic retained capture through the real Maps parser, match authority, freshness and grid kernel. */
export function localTransportFixture(unacknowledged = false, asOf?: Date) {
  const f = localResultFixture(),
    row = f.binding.rows[0],
    now = asOf ?? f.now;
  const saved = resultObservation(row, { rank: 3, unacknowledged });
  const evidence = localPointEvidence(
    row,
    saved.observation,
    saved.decisions,
    f.binding.definition.identityRevisionId,
    now,
  );
  const config = definitionSourceFixture().policy.config;
  if (!config) throw new Error("Synthetic captured policy fixture missing");
  const intent: LocalMonitorScheduleIntent = {
    id: f.binding.occurrence.scheduleIntentId,
    projectId: f.binding.run.projectId,
    monitorId: f.binding.occurrence.monitorId,
    definitionRevisionId: f.binding.revision.id,
    previousRevisionId: null,
    revision: 1,
    mode: "manual",
    scheduleId: null,
    snapshot: null,
    approvalDigest: null,
    capabilityVersion: null,
    actorId: null,
    createdAt: f.binding.occurrence.createdAt,
  };
  const freshnessPolicy = localFreshnessFromIntent(
    f.binding,
    intent,
    {
      state: "ready",
      policyEpoch: "8",
      config: { ...config, freshness: { ...config.freshness, manualTtlMs: 3_600_000 } },
    },
    now,
  );
  const projection = projectLocalRun(
    f.binding,
    new Map([[row.item.id, evidence]]),
    f.receipt,
    now,
    { freshForMs: freshnessPolicy.freshForMs },
  );
  const result: LocalMonitorRunResult = {
    version: 1,
    ...localTransportIds,
    asOf: now.toISOString(),
    createdAt: f.binding.run.createdAt.toISOString(),
    definitionRevisionId: f.binding.revision.id,
    definitionRevision: f.binding.revision.revision,
    identityRevisionId: f.binding.definition.identityRevisionId,
    subject: "Synthetic original business",
    protocol: {
      geometry: f.binding.definition.grid.geometryModel,
      matcher: "business-match-maps-v1",
      normalizerVersions: [row.record.adapterVersion],
      metricDefinition: "sampled-grid-top-n-v1",
    },
    financialBasis: "current_accounting_state",
    freshnessPolicy,
    receipt: f.receipt,
    ...projection,
  };
  const history: LocalMonitorRunHistory = {
    version: 1,
    projectId: result.projectId,
    monitorId: result.monitorId,
    asOf: result.asOf,
    window: { from: null, to: result.asOf, timeBasis: "occurrence_created_at" },
    eligibleTotal: 1,
    items: [
      {
        runId: result.runId,
        createdAt: f.binding.occurrence.createdAt.toISOString(),
        definitionRevision: result.definitionRevision,
        mode: f.binding.occurrence.mode,
      },
    ],
    nextCursor: null,
  };
  const pointHistory: LocalPointHistory = {
    version: 1,
    asOf: result.asOf,
    targetId: row.stored.publicId,
    scope: "exact_captured_target",
    limit: 20,
    hasMore: false,
    window: history.window,
    eligibleTotal: 1,
    nextCursor: null,
    policyEpoch: freshnessPolicy.policyEpoch,
    freshnessConfigurationRevision: freshnessPolicy.configurationRevision,
    items: [
      {
        id: row.item.id,
        runId: result.runId,
        createdAt: row.item.createdAt.toISOString(),
        observedAt: result.points[0].observedAt,
        position: result.points[0].position,
        evidence: result.points[0].evidence,
        reason: result.points[0].reason,
        freshness: result.points[0].freshness,
        freshnessReason: result.points[0].freshnessReason,
      },
    ],
  };
  const listings: LocalResultListing[] = saved.observation.items.map((item) => {
    const match = evidence.listingMatches.get(item.id);
    return {
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
      matched:
        match === "confirmed" || match === "candidate" || match === "rejected"
          ? match
          : "unavailable",
      cid: item.cid,
      placeId: item.placeId,
      sourcePage: item.sourcePage,
      sourceBlockId: item.sourceBlockId,
      sourceOrdinal: item.sourceOrdinal,
      rankScale: item.rankScale,
    };
  });
  const ports: LocalMonitorApiReaders = {
    result: async () => result,
    history: async () => history,
    point_history: async () => pointHistory,
    listings: async () => listings,
  };
  return { ...f, result, history, pointHistory, listings, ports };
}
