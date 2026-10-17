import type {
  LocalMonitorRunHistory,
  LocalMonitorRunResult,
  LocalPointHistory,
  LocalResultListing,
  LocalResultReceipt,
} from "@/lib/local-monitor-results/model";

function receiptItem(item: LocalResultReceipt["items"][number]) {
  return {
    targetId: item.targetId,
    status: item.status,
    version: item.version,
    acceptance: item.acceptance,
    knownAcceptedTaskCount: item.knownAcceptedTaskCount,
    collected: item.collected,
    cancellationRequested: item.cancellationRequested,
    financialState: item.financialState,
    ownerRetained: item.ownerRetained,
    resolution: item.resolution,
    accountingPending: item.accountingPending,
    reconciliationReason: item.reconciliationReason,
  };
}
function receipt(value: LocalResultReceipt) {
  return {
    id: value.id,
    version: value.version,
    cancellationRequested: value.cancellationRequested,
    expectedCount: value.expectedCount,
    items: value.items.map(receiptItem),
    counts: {
      items: value.counts.items,
      complete: value.counts.complete,
      acceptanceUnresolved: value.counts.acceptanceUnresolved,
      accountingPending: value.counts.accountingPending,
      unavailable: value.counts.unavailable,
      retainedOwners: value.counts.retainedOwners,
    },
  };
}

/** Finite wire fields come from the retained reader; neither credentials nor raw provider data spread. */
export function publicLocalRunResult(report: LocalMonitorRunResult) {
  return {
    version: report.version,
    projectId: report.projectId,
    monitorId: report.monitorId,
    runId: report.runId,
    asOf: report.asOf,
    createdAt: report.createdAt,
    definitionRevisionId: report.definitionRevisionId,
    definitionRevision: report.definitionRevision,
    identityRevisionId: report.identityRevisionId,
    subject: report.subject,
    protocol: {
      geometry: report.protocol.geometry,
      matcher: report.protocol.matcher,
      normalizerVersions: [...report.protocol.normalizerVersions],
      metricDefinition: report.protocol.metricDefinition,
    },
    financialBasis: report.financialBasis,
    freshnessPolicy: report.freshnessPolicy
      ? {
          basis: report.freshnessPolicy.basis,
          freshForMs: report.freshnessPolicy.freshForMs,
          freshnessReason: report.freshnessPolicy.freshnessReason,
          policyEpoch: report.freshnessPolicy.policyEpoch,
          configurationRevision: report.freshnessPolicy.configurationRevision,
          semantics: report.freshnessPolicy.semantics,
        }
      : null,
    receipt: receipt(report.receipt),
    points: report.points.map((point) => ({
      id: point.id,
      keywordId: point.keywordId,
      keyword: point.keyword,
      ordinal: point.ordinal,
      row: point.row,
      column: point.column,
      latitude: point.latitude,
      longitude: point.longitude,
      surface: point.surface,
      cutoff: point.cutoff,
      zoom: point.zoom,
      language: point.language,
      device: point.device,
      operatingSystem: point.operatingSystem,
      observedAt: point.observedAt,
      recordedAt: point.recordedAt,
      position: point.position,
      observedPosition: point.observedPosition,
      evidence: point.evidence,
      reason: point.reason,
      freshness: point.freshness,
      freshnessReason: point.freshnessReason,
      identityMatch: point.identityMatch,
      scopeClass: point.scopeClass,
      receipt: receiptItem(point.receipt),
    })),
    grids: report.grids.map((grid) => ({
      keywordId: grid.keywordId,
      keyword: grid.keyword,
      gridRevisionKey: grid.gridRevisionKey,
      identityRevisionId: grid.identityRevisionId,
      topN: grid.topN,
      size: grid.size,
      pointIds: [...grid.pointIds],
      expected: grid.expected,
      observedRate: grid.observedRate,
      observedCoverage: grid.observedCoverage,
      dataCoverage: grid.dataCoverage,
      sampleBounds: grid.sampleBounds,
      ...(grid.reason ? { reason: grid.reason } : {}),
      counts: {
        expected: grid.counts.expected,
        measured: grid.counts.measured,
        metricEligible: grid.counts.metricEligible,
        ranked: grid.counts.ranked,
        stale: grid.counts.stale,
        unknown: grid.counts.unknown,
        knownAbsent: grid.counts.knownAbsent,
        failed: grid.counts.failed,
        neverChecked: grid.counts.neverChecked,
        unsupported: grid.counts.unsupported,
        freshDeterminate: grid.counts.freshDeterminate,
        unknownFreshness: grid.counts.unknownFreshness,
        comparable: grid.counts.comparable,
      },
      freshness: grid.freshness,
      comparison: grid.comparison,
      scope: grid.scope,
    })),
  };
}

export function publicLocalRunHistory(report: LocalMonitorRunHistory) {
  return {
    version: report.version,
    projectId: report.projectId,
    monitorId: report.monitorId,
    asOf: report.asOf,
    window: report.window
      ? { from: report.window.from, to: report.window.to, timeBasis: report.window.timeBasis }
      : null,
    eligibleTotal: report.eligibleTotal ?? null,
    items: report.items.map((item) => ({
      runId: item.runId,
      createdAt: item.createdAt,
      definitionRevision: item.definitionRevision,
      mode: item.mode,
    })),
    nextCursor: report.nextCursor,
  };
}
export function publicLocalPointHistory(report: LocalPointHistory) {
  return {
    version: report.version,
    asOf: report.asOf,
    targetId: report.targetId,
    scope: report.scope,
    limit: report.limit,
    hasMore: report.hasMore,
    window: report.window
      ? { from: report.window.from, to: report.window.to, timeBasis: report.window.timeBasis }
      : null,
    eligibleTotal: report.eligibleTotal ?? null,
    nextCursor: report.nextCursor ?? null,
    policyEpoch: report.policyEpoch ?? null,
    freshnessConfigurationRevision: report.freshnessConfigurationRevision ?? null,
    items: report.items.map((item) => ({
      id: item.id,
      runId: item.runId,
      createdAt: item.createdAt,
      observedAt: item.observedAt,
      position: item.position,
      evidence: item.evidence,
      reason: item.reason,
      freshness: item.freshness ?? null,
      freshnessReason: item.freshnessReason ?? null,
    })),
  };
}
export function publicLocalListing(item: LocalResultListing) {
  return {
    id: item.id,
    name: item.name,
    rankGroup: item.rankGroup,
    rankAbsolute: item.rankAbsolute,
    promotion: item.promotion,
    observedAt: item.observedAt,
    matched: item.matched,
    cid: typeof item.cid === "string" ? item.cid : null,
    placeId: item.placeId ?? null,
    sourcePage: item.sourcePage ?? null,
    sourceBlockId: item.sourceBlockId ?? null,
    sourceOrdinal: item.sourceOrdinal ?? null,
    rankScale: item.rankScale ?? null,
  };
}
