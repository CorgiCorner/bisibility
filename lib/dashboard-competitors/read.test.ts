import type { Prisma } from "@/lib/generated/prisma/client";
import { normalizeOverviewFilters } from "@/lib/queries/overview-filters";
import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
import { beforeEach, expect, it, vi } from "vitest";
import {
  comparisonAsOf,
  comparisonConfig,
  comparisonObservation,
  comparisonProject,
  comparisonSelection,
} from "./fixture";
import { readDashboardComparison } from "./read";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  policies: vi.fn(),
  observations: vi.fn(),
  baseline: vi.fn(),
}));
vi.mock("@/lib/queries/competitor-current-data", () => ({
  loadCompetitorCurrentData: mocks.current,
}));
vi.mock("@/lib/queries/competitor-policies", () => ({ loadCompetitorPolicies: mocks.policies }));
const options = {
  asOf: comparisonAsOf,
  loadMetadata: vi.fn(),
  policyAt: hostOrganicReportPolicy,
  limits: { maxTargets: 10, maxItems: 10, maxChecks: 10 },
};
const market = vi.fn();
const tx = { projectMarket: { findFirst: market } } as unknown as Prisma.TransactionClient;
const filters = normalizeOverviewFilters({
  range: "7d",
  device: "mobile",
  marketIds: ["loc"],
  tag: "core",
});
beforeEach(() => {
  vi.clearAllMocks();
  market.mockResolvedValue({
    location: { id: "loc", displayName: "Krakow", languageLabel: "Polish", kind: "city" },
  });
  mocks.policies.mockResolvedValue([
    {
      domain: "rival.test",
      label: "Rival",
      publicId: "cmp_abcdefghijklmnopqrstuvwx",
      scopePolicy: "all_markets",
      marketOverrides: [],
    },
  ]);
  mocks.observations.mockReturnValue([
    comparisonObservation("one", 2, 5, 100),
    comparisonObservation("two", 8, 3, null),
  ]);
  mocks.baseline.mockReturnValue({
    rows: [comparisonObservation("one", 5, 2, 100), comparisonObservation("two", 9, 2, null)],
    comparableIds: ["one", "two"],
  });
  mocks.current.mockResolvedValue({
    observationsFor: mocks.observations,
    baselineFor: mocks.baseline,
    baselineAsOf: new Date("2026-10-05T12:00:00Z"),
  });
});
it("binds exact saved axes/tag/exclusions and reuses the frozen IDs and volume imputation for both periods", async () => {
  const config = comparisonConfig();
  config.filters.excludedKeywordIds = ["excluded"];
  const report = await readDashboardComparison(
    tx,
    { id: "viewer" },
    comparisonProject,
    comparisonSelection,
    config,
    filters,
    options,
  );
  expect(mocks.current.mock.calls[0][4]).toEqual({
    currentNotBefore: new Date("2026-10-06T00:00:00Z"),
    where: {
      locationId: "loc",
      device: "mobile",
      publicId: { notIn: ["excluded"] },
      tags: { some: { tag: { name: "core" } } },
    },
  });
  expect(report).toMatchObject({
    expectedIds: ["one", "two"],
    comparableCount: 2,
    population: "frozen_current_filtered_cohort",
    selectionRevisionId: `${comparisonSelection.viewId}:3`,
    asOf: comparisonAsOf.toISOString(),
    baselineAsOf: "2026-10-05T12:00:00.000Z",
  });
  expect(report?.current.quality.domainSet).toEqual(report?.baseline?.quality.domainSet);
  expect(report?.current.quality.imputedWeightShare).toBe(0.5);
  expect(report?.baseline?.quality.imputedWeightShare).toBe(0.5);
  expect(report?.deltas.every((row) => row.percentagePoints !== null)).toBe(true);
});
it("freezes a current position-filtered cohort instead of filtering its baseline independently", async () => {
  const config = comparisonConfig();
  config.filters.position = "top3";
  const report = await readDashboardComparison(
    tx,
    { id: "viewer" },
    comparisonProject,
    comparisonSelection,
    config,
    filters,
    options,
  );
  expect(report?.expectedIds).toEqual(["one"]);
  expect(report?.baseline?.observations.map((row) => row.id)).toEqual(["one"]);
  expect(report?.baseline?.observations[0].ranks["example.test"]).toBe(5);
});
it("does not manufacture a change when any selected baseline is uncomparable", async () => {
  mocks.baseline.mockReturnValue({
    rows: [
      comparisonObservation("one"),
      { ...comparisonObservation("two", 9, 2, null), quality: undefined },
    ],
    comparableIds: ["one"],
  });
  const report = await readDashboardComparison(
    tx,
    { id: "viewer" },
    comparisonProject,
    comparisonSelection,
    comparisonConfig(),
    filters,
    options,
  );
  expect(report?.comparableCount).toBe(1);
  expect(report?.baseline?.quality.unknown).toBe(1);
  expect(report?.deltas.every((row) => row.percentagePoints === null)).toBe(true);
});
it.each([
  { rows: [] },
  { rows: [comparisonObservation("one", 5, 2, 999), comparisonObservation("two", 9, 2, null)] },
])("refuses a missing or reweighted baseline cohort", async ({ rows }) => {
  mocks.baseline.mockReturnValue({ rows, comparableIds: ["one", "two"] });
  await expect(
    readDashboardComparison(
      tx,
      { id: "viewer" },
      comparisonProject,
      comparisonSelection,
      comparisonConfig(),
      filters,
      options,
    ),
  ).rejects.toThrow("snapshot");
});
it("does not load all markets when the chosen active market is unavailable", async () => {
  market.mockResolvedValue(null);
  expect(
    await readDashboardComparison(
      tx,
      { id: "viewer" },
      comparisonProject,
      comparisonSelection,
      comparisonConfig(),
      filters,
      options,
    ),
  ).toBeNull();
  expect(mocks.current).not.toHaveBeenCalled();
});

it("does not call an own-only 100% share a competitor comparison when no allowed competitor applies", async () => {
  mocks.policies.mockResolvedValue([]);
  expect(
    await readDashboardComparison(
      tx,
      { id: "viewer" },
      comparisonProject,
      comparisonSelection,
      comparisonConfig(),
      filters,
      options,
    ),
  ).toBeNull();
  expect(mocks.current).not.toHaveBeenCalled();
});
