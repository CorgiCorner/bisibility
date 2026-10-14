import type { LocalDashboardContext } from "@/lib/dashboard-local/model";
import type { DashboardSurfacePreference } from "@/lib/project-surface-preferences/dashboard-model";
import type { LocalReportSummary } from "./report-summary";

export const localStoryContext: LocalDashboardContext = {
  state: "ready",
  selection: {
    scope: { kind: "keyword", id: "kw_abcdefghijklmnopqrstuvwx" },
    locationId: "biz_abcdefghijklmnopqrstuvwx",
    identityRevisionId: "identity-fixture-1",
    assignmentRevision: 1,
  },
  choices: [
    {
      label: "Synthetic location · Example business",
      selection: {
        scope: { kind: "keyword", id: "kw_abcdefghijklmnopqrstuvwx" },
        locationId: "biz_abcdefghijklmnopqrstuvwx",
        identityRevisionId: "identity-fixture-1",
        assignmentRevision: 1,
      },
    },
  ],
};
export const localStoryPreference: DashboardSurfacePreference = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  revision: 2,
  defaultPreset: "general",
  presentation: { schemaVersion: 1, layouts: {}, localSelection: localStoryContext.selection },
};
export const localStoryReport: LocalReportSummary = {
  asOf: "2026-10-12T12:00:00.000Z",
  subject: {
    locationId: "biz_abcdefghijklmnopqrstuvwx",
    name: "Example business",
    identityRevisionId: "identity-fixture-1",
    matcherVersion: "business-match-v1",
  },
  expected: 10,
  retainedChecks: 16,
  presence: 75,
  targetTop3: 50,
  conditionalTop3: (100 * 4) / 6,
  averageFoundSlot: 2,
  averageFoundCount: 4,
  matchCoverage: 1,
  observedCoverage: 0.8,
  freshness: "fresh",
  counts: {
    expected: 10,
    measured: 8,
    metricEligible: 8,
    ranked: 4,
    knownAbsent: 4,
    unknown: 2,
    neverChecked: 0,
    failed: 1,
    stale: 0,
    unsupported: 0,
    freshDeterminate: 8,
    unknownFreshness: 0,
    comparable: 0,
  },
};
