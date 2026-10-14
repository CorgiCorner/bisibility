import type { RankReportPolicy, RankReportTarget } from "@/lib/rank-reports/model";
import {
  reportCheck,
  reportKeyword,
  reportPolicy,
  reportProject,
  reportTarget,
} from "@/lib/rank-reports/report-test-fixture";
import { mapKeyword } from "./keyword-row";
import { projectRankTrackerQuality } from "./rank-tracker-report-projection";
import { resolveCurrentRankTrackerTargets } from "./rank-tracker-report-resolve";

export function rankTrackerQualityFixture(
  target: RankReportTarget = reportTarget(),
  policy: RankReportPolicy = reportPolicy(),
) {
  const row = mapKeyword(
    {
      createdAt: new Date("2026-01-01T00:00:00Z"),
      device: "mobile",
      id: "keyword-db",
      intent: null,
      location: "Krakow",
      locationRef: {
        canonicalKey: "PL/Krakow",
        cityName: "Krakow",
        countryCode: "PL",
        displayName: "Krakow",
        gl: "pl",
        hl: "pl",
        id: "location-db",
        kind: "city",
      },
      publicId: target.id,
      rankChecks: [],
      schedule: null,
      tags: [],
      targetUrl: "https://example.test/current-editable",
      text: "Service",
      topic: null,
    },
    { defaults: null, domain: "example.test" },
    { cpc: null, difficulty: null, serpFeatures: [], volume: target.volume },
  );
  const scoped = {
    ...target,
    expectedScope:
      target.expectedScope === undefined
        ? {
            device: "mobile",
            engine: "google",
            language: "pl",
            location: "Krakow",
            policyRevision: "policy-v1",
            projectId: reportProject.id,
            rankScale: "organic_group",
            resultKind: "organic_result",
            surface: "web_serp",
            targetId: target.id,
            targetRevision: "target-v1",
          }
        : target.expectedScope,
  };
  const resolved = resolveCurrentRankTrackerTargets([scoped], policy, reportProject.id)[0];
  return {
    resolution: resolved,
    row: projectRankTrackerQuality(row, resolved, policy, reportProject.id),
  };
}

export { reportCheck, reportKeyword, reportPolicy, reportProject, reportTarget };
