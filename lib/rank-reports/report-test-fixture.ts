import type {
  RankReportPolicy,
  RankReportRequest,
  RankReportTarget,
  RetainedReportCheck,
} from "./model";

export const reportAsOf = new Date("2026-10-12T12:00:00.000Z");
export const reportProject = {
  id: "project-db",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
} as const;
export const reportKeyword = "kw_abcdefghijklmnopqrstuvwx";
export function reportCheck(
  position: number | null,
  overrides: Partial<RetainedReportCheck> = {},
): RetainedReportCheck {
  const recordedAt = new Date("2026-10-12T10:01:00.000Z");
  const geo = { device: "mobile", language: "pl", location: "Krakow" };
  return {
    attemptCount: 1,
    checkedAt: new Date("2026-10-12T10:02:00.000Z"),
    createdAt: recordedAt,
    deferredReason: null,
    errorCode: null,
    expectedUrlAtCheck: "https://example.test/expected",
    finishedAt: recordedAt,
    id: "check_abcdefghijklmnopqrstuvwx",
    normalizationVersion: "v1",
    observationRun: {
      completeness: "complete",
      configuredScope: geo,
      createdAt: recordedAt,
      effectiveScope: geo,
      engine: "google",
      executedAt: recordedAt,
      items: [],
      projectId: reportProject.id,
      provider: "synthetic",
      requestPolicy: {
        evidence: {
          completeThrough: { organic_result: 100 },
          observedAt: "2026-10-12T10:00:00.000Z",
          policyRevision: "policy-v1",
          targetRevision: "target-v1",
          version: 1,
        },
      },
      surface: "web_serp",
    },
    position,
    provider: "synthetic",
    rankingUrl: "https://example.test/historical",
    requestedDepth: 100,
    startedAt: recordedAt,
    status: "completed",
    updatedAt: recordedAt,
    ...overrides,
  };
}
export function reportPolicy(): RankReportPolicy {
  return {
    asOf: new Date(reportAsOf.getTime()),
    baseline: {
      before: new Date("2026-09-30T23:59:59.999Z"),
      mode: "before",
      notBefore: new Date("2026-09-01T00:00:00.000Z"),
    },
    currentNotBefore: new Date("2026-10-01T00:00:00.000Z"),
    freshForMs: null,
    horizon: 3,
    metric: {
      curve: [100, 50, 10],
      definitionVersion: "synthetic-ranking-v1",
      id: "synthetic-ranking",
    },
    minimumRequestedDepth: 3,
    weightProvenance: { market: null, period: null, source: null },
  };
}
export function reportRequest(): RankReportRequest {
  return {
    pageLimit: 25,
    projectId: reportProject.publicId,
    selectedIds: [reportKeyword],
    stream: "observations",
    window: {
      basis: "recorded_at",
      from: "2026-09-01T00:00:00.000Z",
      to: reportAsOf.toISOString(),
    },
  };
}
export function reportTarget(): RankReportTarget {
  return { checks: [reportCheck(2)], id: reportKeyword, volume: null };
}
