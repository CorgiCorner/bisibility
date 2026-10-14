import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import type { MeasurementScope } from "@/lib/rank-measurements/types";
import { hostOrganicReportPolicy, RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import type { RetainedReportCheck } from "@/lib/rank-reports/model";
import { reportCheck } from "@/lib/rank-reports/report-test-fixture";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

export const legacyAsOf = new Date("2026-10-12T12:00:00.000Z");
export const legacyProject = {
  id: "internal-project",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
  domain: "own.test",
};
export function legacyKeyword(index = 0, locationId = "us") {
  const token = String.fromCharCode(97 + index);
  return {
    id: `db-${index}`,
    publicId: `kw_${token}bcdefghijklmnopqrstuvwx`,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    locationId,
    text: `keyword-${index}`,
    archivedAt: null,
    device: "desktop" as const,
    schedule: null,
  };
}
export function legacyScope(
  publicId: string,
  projectId = legacyProject.id,
  device = "desktop",
): MeasurementScope {
  return { ...fixtureScope, projectId, targetId: publicId, location: "US", language: "en", device };
}
export function legacyReportOptions(
  now = legacyAsOf,
  projectId = legacyProject.id,
  changes: {
    scope?: MeasurementScope | null;
    freshForMs?: number | null;
    scopes?: ReadonlyMap<string, MeasurementScope>;
  } = {},
): RankTrackerReportOptions {
  return {
    asOf: now,
    limits: RANK_REPORT_HOST_LIMITS,
    policyAt: (at) => hostOrganicReportPolicy(at, 7),
    loadMetadata: async (_tx, _project, rows) =>
      new Map(
        rows.map(({ publicId }) => [
          publicId,
          {
            expectedScope:
              changes.scope === undefined
                ? (changes.scopes?.get(publicId) ?? legacyScope(publicId, projectId))
                : changes.scope,
            freshForMs: changes.freshForMs === undefined ? 3 * 86400000 : changes.freshForMs,
            volume: 1,
            baselineWindow: null,
          },
        ]),
      ),
  };
}
export function legacyDbCheck(
  keyword: Omit<ReturnType<typeof legacyKeyword>, "device"> & { device: "desktop" | "mobile" },
  position: number | null,
  index = 0,
  changes: Partial<RetainedReportCheck> = {},
  projectId = legacyProject.id,
) {
  const scope = legacyScope(keyword.publicId, projectId, keyword.device);
  const base = reportCheck(position);
  if (!base.observationRun) throw new Error("Expected captured report fixture");
  return {
    ...base,
    publicId: `check_${String.fromCharCode(97 + index)}bcdefghijklmnopqrstuvwx`,
    keywordId: keyword.id,
    ...changes,
    observationRun:
      changes.observationRun !== undefined
        ? changes.observationRun
        : {
            ...base.observationRun,
            projectId,
            configuredScope: scope,
            effectiveScope: scope,
            requestPolicy: {
              evidence: {
                version: 1,
                targetRevision: scope.targetRevision,
                policyRevision: scope.policyRevision,
                observedAt: "2026-10-12T10:00:00.000Z",
                completeThrough: { organic_result: 100 },
              },
            },
            items: [
              {
                createdAt: base.createdAt,
                id: "item-rival",
                blockPosition: null,
                businessName: null,
                cid: null,
                domain: "rival.test",
                mapsUrl: null,
                ordinal: 0,
                placeId: null,
                positionInBlock: null,
                rankAbsolute: 2,
                rankGroup: 2,
                resultKind: "organic_result",
                title: null,
                url: "https://rival.test/",
              },
            ],
          },
  };
}
