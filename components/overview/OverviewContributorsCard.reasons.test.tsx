import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { overviewContributors } from "@/lib/queries/overview-contributors";
import type { Keyword } from "@/lib/queries/overview-trend";
import { aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import { fixturePolicy, fixtureScope, measurement } from "@/lib/rank-measurements/fixtures";
import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import en from "@/messages/core/en/project-dashboard.json";
import enShared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-dashboard.json";
import esShared from "@/messages/core/es-ES/shared.json";
import ja from "@/messages/core/ja/project-dashboard.json";
import jaShared from "@/messages/core/ja/shared.json";
import pl from "@/messages/core/pl/project-dashboard.json";
import plShared from "@/messages/core/pl/shared.json";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewContributorsCard } from "./OverviewContributorsCard";
import { ProjectDashboardMessages } from "./ProjectDashboardMessages";

function fixture() {
  const keywords: Keyword[] = ["positive", "definition", "absence", "stale"].map((id) => ({
    id,
    publicId: `kw_${id}`,
    projectId: "project-a",
    text: `Synthetic ${id}`,
    device: "desktop",
    createdAt: new Date("2026-01-01"),
    schedule: null,
    _count: { rankChecks: 1 },
    rankChecks: [],
    locationRef: { displayName: "City A", languageLabel: "English" },
  }));
  const targets = keywords.map((keyword) => {
    const scope = { ...fixtureScope, targetId: keyword.publicId };
    const evidence = measurement(keyword.id === "absence" ? null : 1, {
      targetId: keyword.publicId,
      configuredScope: scope,
      effectiveScope: scope,
      ...(keyword.id === "absence" ? { completeThrough: null } : {}),
      ...(keyword.id === "stale" ? { observedAt: new Date("2026-10-01T10:00:00Z") } : {}),
    });
    return {
      id: keyword.publicId,
      baseline: null,
      volume: 1,
      current: qualifyMeasurement(evidence, {
        ...fixturePolicy,
        ...(keyword.id === "definition" ? { requireCurrentScope: true, expectedScope: null } : {}),
      }),
    };
  });
  const report = aggregateMeasurements(targets, {
    asOf: fixturePolicy.asOf,
    curve: [1],
    metricId: "fixture",
    definitionVersion: "fixture-v1",
  });
  return { report, rows: overviewContributors(keywords, report) };
}

const locales = [
  { locale: "en", dashboard: en, shared: enShared },
  { locale: "es-ES", dashboard: es, shared: esShared },
  { locale: "ja", dashboard: ja, shared: jaShared },
  { locale: "pl", dashboard: pl, shared: plShared },
] as const;

describe("contributor exclusion explanations", () => {
  it.each(locales)(
    "shows each retained reason visibly in $locale without changing the metric",
    ({ locale, dashboard, shared }) => {
      const { report, rows } = fixture();
      const original = JSON.stringify({ report, rows });
      const labels = dashboard.projectDashboard.reportWidgets;
      expect(report.value).toBe(100);
      render(
        <ProjectDashboardMessages
          locale={locale}
          messages={mergeMessageCatalogs(shared, dashboard)}
        >
          <OverviewContributorsCard rows={rows} report={report} projectRef="prj_test" />
        </ProjectDashboardMessages>,
      );
      for (const [name, reason] of [
        ["definition", "current_scope_unavailable"],
        ["absence", "unproven_absence"],
        ["stale", "stale"],
      ] as const) {
        const row = within(screen.getByRole("row", { name: new RegExp(`Synthetic ${name}`) }));
        expect(row.getByText(labels.exclusionReasons[reason])).toBeVisible();
        expect(row.getByText(labels.excluded)).toBeVisible();
        expect(row.getAllByText(labels.unknown)).toHaveLength(2);
      }
      expect(
        screen.getByText(labels.sum.replace("{value}", "100").replace("{delta}", labels.unknown)),
      ).toBeVisible();
      expect(JSON.stringify({ report, rows })).toBe(original);
    },
  );

  it.each([null, "__proto__", "constructor", "provider_secret=not-for-display"])(
    "uses the localized fallback for an unavailable or unrecognized reason: %s",
    (reason) => {
      const { report, rows } = fixture();
      const changed = rows.map((row) => (row.id === "kw_definition" ? { ...row, reason } : row));
      render(
        <ProjectDashboardMessages>
          <OverviewContributorsCard rows={changed} report={report} projectRef="prj_test" />
        </ProjectDashboardMessages>,
      );
      const row = within(screen.getByRole("row", { name: /Synthetic definition/ }));
      expect(
        row.getByText(en.projectDashboard.reportWidgets.exclusionReasons.unknown),
      ).toBeVisible();
      if (reason) expect(row.queryByText(reason, { exact: false })).not.toBeInTheDocument();
    },
  );
});
