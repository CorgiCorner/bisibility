import { sharedMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
} from "@/lib/competitors/competitor-market-model";
import {
  comparisonAsOf,
  comparisonObservation,
  comparisonSelection,
} from "@/lib/dashboard-competitors/fixture";
import type { DashboardComparisonReport } from "@/lib/dashboard-competitors/model";
import { normalizeOverviewFilters } from "@/lib/queries/overview-filters";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DashboardComparisonCard } from "./DashboardComparisonCard";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, args?: Record<string, unknown>) =>
    `${key}${args ? JSON.stringify(args) : ""}`,
  getFormatter: async () => ({
    number: (value: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat("en", opts).format(value),
  }),
}));
vi.mock("@/components/measurement-help/LocalizedMeasurementHelp", () => ({
  LocalizedMeasurementHelp: () => null,
}));
function report(): DashboardComparisonReport {
  const market = buildCompetitorMarket(
    {
      allColumns: [
        { domain: "example.test", label: "Example", kind: "You" },
        { domain: "rival.test", label: "Rival", kind: "Managed" },
      ],
      competitorCount: 1,
      device: "mobile",
      engine: "google",
      key: "loc:mobile",
      languageLabel: "Polish",
      location: "Krakow",
      locationId: "loc",
      locationKind: "city",
      observations: [comparisonObservation("one")],
      tags: ["core"],
      trackedKeywordCount: 1,
    },
    emptyCompetitorFilter,
  );
  return {
    asOf: comparisonAsOf.toISOString(),
    baselineAsOf: "2026-10-05T12:00:00Z",
    selection: comparisonSelection,
    selectionRevisionId: "view:3",
    filters: normalizeOverviewFilters(),
    expectedIds: ["one"],
    current: market,
    baseline: null,
    comparableCount: 0,
    deltas: market.shares.map((row) => ({ domain: row.domain, percentagePoints: null })),
    population: "frozen_current_filtered_cohort",
  };
}
it("renders actual shared version/coverage and null baseline as unknown rather than zero or fabricated movement", async () => {
  const html = renderToStaticMarkup(
    sharedMessagesElement(await DashboardComparisonCard({ report: report() })),
  );
  expect(html).toContain("bisibility-sov-top10-v2");
  expect(html).toContain(
    "comparisonCoverage{&quot;comparable&quot;:&quot;0&quot;,&quot;expected&quot;:&quot;1&quot;}",
  );
  expect(html).toContain("60%");
  expect(html.match(/unknown/g)?.length).toBe(4);
  expect(html).not.toContain("0 pp");
});
it("rejects an unsupported metric definition before interpreting its scores", async () => {
  const value = report();
  value.current.quality.definitionVersion =
    "unsupported" as typeof value.current.quality.definitionVersion;
  await expect(DashboardComparisonCard({ report: value })).rejects.toThrow(
    "Unsupported comparison definition",
  );
});
