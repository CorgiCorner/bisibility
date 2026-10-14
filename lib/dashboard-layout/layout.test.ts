import { describe, expect, it } from "vitest";
import { composeDashboardLayout, mandatoryDashboardShell, resolveDashboardLayout } from "./compose";
import { parseDashboardLayout, presetDashboardLayout } from "./layout";
import { dashboardWidgetRegistry } from "./registry";
import { organicAccess } from "./test-fixtures";
import type { DashboardAccess, DashboardLayout } from "./types";

describe("dashboard layout and projection planning", () => {
  it("defaults to existing organic General without opting into Local or Competitors", () => {
    const result = resolveDashboardLayout(null, organicAccess);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("Expected General");
    expect(result.composition.layout.preset).toBe("general");
    expect(
      result.composition.widgets
        .filter((widget) => widget.selection.visible)
        .map((widget) => widget.selection.id),
    ).toEqual([
      "organic_kpis",
      "position_trend",
      "position_distribution",
      "recent_targets",
      "data_source",
      "by_market",
      "movers",
    ]);
    expect(result.composition.projections.all).not.toContain("local_business_observations");
    expect(result.composition.projections.all).not.toContain("competitor_comparison");
  });

  it("rejects executable config, duplicate/unknown IDs, arbitrary span, and unsupported schema without a scope fallback", () => {
    const valid = presetDashboardLayout();
    for (const input of [
      { ...valid, query: "SELECT private_data" },
      { ...valid, schemaVersion: 2 },
      { ...valid, widgets: [{ id: "unknown_widget", visible: true, span: "standard" }] },
      { ...valid, widgets: [valid.widgets[0], valid.widgets[0]] },
      { ...valid, widgets: [{ ...valid.widgets[0], span: "900px" }] },
      { ...valid, widgets: [{ ...valid.widgets[0], jsx: "<script>" }] },
    ]) {
      expect(parseDashboardLayout(input)).toBeNull();
      expect(resolveDashboardLayout(input, organicAccess)).toEqual({ status: "invalid_layout" });
    }
  });

  it("deduplicates shared aggregation/highlights and drops hidden detailed projections but keeps every shell", () => {
    const all = composeDashboardLayout(presetDashboardLayout(), organicAccess);
    expect(all.projections.details.filter((id) => id === "organic_summary")).toHaveLength(1);
    expect(all.projections.details.filter((id) => id === "keyword_highlights")).toHaveLength(1);
    const hidden: DashboardLayout = {
      ...all.layout,
      widgets: all.layout.widgets.map((widget) => ({ ...widget, visible: false })),
    };
    const none = composeDashboardLayout(hidden, organicAccess);
    expect(none.projections.details).toEqual([]);
    expect(none.shell).toEqual(["scope", "mode", "health", "budget", "coverage"]);
    expect(none.projections.all).toEqual([
      "scope_context",
      "execution_health",
      "budget_status",
      "coverage_summary",
    ]);
    expect(Object.isFrozen(mandatoryDashboardShell)).toBe(true);
  });

  it("retains unsupported selections in order with reasons and requests no unavailable projection", () => {
    const layout: DashboardLayout = {
      schemaVersion: 1,
      preset: "general",
      widgets: [
        { id: "contributors", visible: true, span: "wide" },
        { id: "organic_kpis", visible: true, span: "standard" },
      ],
    };
    const result = composeDashboardLayout(layout, organicAccess);
    expect(result.widgets[0]).toMatchObject({
      selection: layout.widgets[0],
      reason: "missing_capability",
    });
    expect(result.projections.all).not.toContain("contributions");
    expect(result.projections.all).toContain("organic_summary");
    expect(
      result.widgets.find((widget) => widget.selection.id === "visibility_history")?.selection
        .visible,
    ).toBe(false);
  });

  it.each([
    ["local", {}, "missing_local_subject"],
    [
      "local",
      { localSubject: { projectId: "other", entityId: "branch", identityRevisionId: "revision" } },
      "foreign_local_subject",
    ],
    ["competitors", { competitorsReadAuthorized: true }, "missing_competitor_scope"],
    [
      "competitors",
      {
        competitorsReadAuthorized: true,
        competitorScope: { projectId: "other", selectionRevisionId: "revision" },
      },
      "foreign_competitor_scope",
    ],
  ] as const)("does not broaden unresolved explicit %s scope", (preset, extra, reason) => {
    const composition = composeDashboardLayout(presetDashboardLayout(preset), {
      ...organicAccess,
      ...extra,
    });
    expect(composition.projections.details).toEqual([]);
    expect(composition.projections.shell).not.toContain("coverage_summary");
    expect(composition.shell).toContain("coverage");
    expect(
      composition.widgets
        .filter((widget) => widget.selection.visible)
        .every((widget) => widget.reason === reason),
    ).toBe(true);
  });

  it("requires explicit project-matched identities/scopes and preserves separate result kinds", () => {
    const access: DashboardAccess = {
      ...organicAccess,
      competitorsReadAuthorized: true,
      capabilities: [
        ...organicAccess.capabilities,
        "local_business_observations",
        "competitor_reports",
      ],
      localSubject: {
        projectId: organicAccess.projectId,
        entityId: "branch-2",
        identityRevisionId: "identity-3",
      },
      competitorScope: { projectId: organicAccess.projectId, selectionRevisionId: "set-4" },
    };
    const local = composeDashboardLayout(presetDashboardLayout("local"), access);
    expect(local.projections.details).toContain("local_business_observations");
    expect(local.projections.details).not.toContain("competitor_comparison");
    const competitors = composeDashboardLayout(presetDashboardLayout("competitors"), access);
    expect(competitors.projections.details).toContain("competitor_comparison");
    expect(competitors.projections.details).not.toContain("organic_summary");
    expect(competitors.projections.details).not.toContain("local_business_observations");
    expect(
      dashboardWidgetRegistry.find((widget) => widget.id === "local_business_results")?.resultKinds,
    ).toEqual(["local_pack"]);
  });

  it("fails closed before query planning when project or competitor read access is absent", () => {
    expect(
      composeDashboardLayout(presetDashboardLayout(), {
        ...organicAccess,
        projectReadAuthorized: false,
      }).projections.all,
    ).toEqual([]);
    const competitor = composeDashboardLayout(presetDashboardLayout("competitors"), organicAccess);
    expect(competitor.projections.details).toEqual([]);
    expect(
      competitor.widgets.find((widget) => widget.selection.id === "competitor_comparison")?.reason,
    ).toBe("missing_competitors_access");
  });
});
