import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import { fixtureAsOf, fixtureScope } from "@/lib/rank-measurements/fixtures";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { expect, it } from "vitest";
import { buildOverviewMarkets } from "./overview-markets";
import { buildOverviewMetrics } from "./overview-metrics";
import { snapshotFor } from "./overview-snapshot";
import { summarizeVisibility, visibilitySnapshotFor } from "./visibility";

function fixture() {
  const source = definitionSourceFixture();
  source.target.location.displayName = "Kraków";
  source.target.location.primaryGeoName = "Krakow,Lesser Poland,Poland";
  source.target.location.hl = "en";
  const scope = { ...fixtureScope, ...frozenConfiguredScope(source.target) };
  const check = recordedFixture(1, { configuredScope: scope, effectiveScope: scope });
  return {
    id: scope.targetId,
    publicId: scope.targetId,
    projectId: scope.projectId,
    text: "Stored target",
    createdAt: new Date("2026-01-01"),
    _count: { rankChecks: 1 },
    locationId: source.target.location.id,
    device: scope.device,
    schedule: null,
    locationRef: {
      displayName: source.target.location.displayName,
      languageCode: "en",
      languageLabel: "English",
    },
    rankChecks: [check],
    measurementPolicy: {
      asOf: fixtureAsOf,
      expectedScope: scope,
      freshForMs: null as number | null,
      requireCurrentScope: true,
      baselineEnabled: false,
    },
  };
}

it("qualifies the actual captured current geo instead of its localized display label", () => {
  const row = fixture();
  const snapshot = snapshotFor(row, 1, fixtureAsOf);
  expect(snapshot.quality.current).toMatchObject({ evidence: "positive", reason: null });
  expect(buildOverviewMetrics([snapshot], { asOf: fixtureAsOf }).averagePosition).toBe(1);
  expect(summarizeVisibility([visibilitySnapshotFor(row, 1, { asOf: fixtureAsOf })]).value).toBe(
    100,
  );
  expect(buildOverviewMarkets([row], { now: fixtureAsOf, range: "7d" })[0]).toMatchObject({
    top10Share: 100,
    deltaPoints: null,
  });
});

it("keeps a country fallback out of the city metric despite a matching display label", () => {
  const row = fixture();
  row.rankChecks[0].observationRun.effectiveScope = {
    ...row.measurementPolicy.expectedScope,
    location: "Poland",
  };
  const snapshot = snapshotFor(row, 1, fixtureAsOf);
  expect(snapshot.quality.current).toMatchObject({ evidence: "unknown", reason: "scope_mismatch" });
  expect(buildOverviewMetrics([snapshot], { asOf: fixtureAsOf }).visibility).toBeNull();
  expect(buildOverviewMarkets([row], { now: fixtureAsOf, range: "7d" })[0].top10Share).toBeNull();
});

it("does not connect a changed target revision by semantic geo equality", () => {
  const row = fixture();
  row.measurementPolicy.expectedScope = {
    ...row.measurementPolicy.expectedScope,
    targetRevision: "target-v2",
  };
  expect(snapshotFor(row, 1, fixtureAsOf).quality.current).toMatchObject({
    evidence: "unknown",
    reason: "scope_mismatch",
  });
  expect(
    summarizeVisibility([visibilitySnapshotFor(row, 1, { asOf: fixtureAsOf })]).value,
  ).toBeNull();
});

it("keeps current definition unavailable distinct from a captured last known observation", () => {
  const row = fixture();
  const unavailable = {
    ...row,
    measurementPolicy: { ...row.measurementPolicy, expectedScope: null },
  };
  const snapshot = snapshotFor(unavailable, 1, fixtureAsOf);
  expect(snapshot.quality.current).toMatchObject({
    evidence: "unknown",
    reason: "current_scope_unavailable",
  });
  expect(buildOverviewMetrics([snapshot], { asOf: fixtureAsOf }).visibility).toBeNull();
});

it("preserves an explicit incompatible requested geo instead of silently widening it", () => {
  const row = fixture();
  const snapshot = visibilitySnapshotFor(row, 1, {
    asOf: fixtureAsOf,
    requestedGeo: { location: "Poland" },
  });
  expect(snapshot.current).toMatchObject({ evidence: "unknown", reason: "scope_mismatch" });
});
