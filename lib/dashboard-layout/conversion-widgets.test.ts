import { defaultPersonalDashboardLayout } from "@/lib/project-surface-preferences/dashboard-model";
import { describe, expect, it } from "vitest";
import { completeDashboardLayout, presetDashboardLayout } from "./layout";
import { dashboardWidget } from "./registry";
import { widgetIds } from "./types";

describe("conversion dashboard widgets", () => {
  it("registers both widgets for the general preset and keeps saved layouts unchanged", () => {
    for (const id of ["organic_conversions", "seo_cost"] as const) {
      expect(widgetIds).toContain(id);
      expect(dashboardWidget(id).projections).toEqual([id]);
      expect(dashboardWidget(id).capabilities).toEqual([id]);
    }
    const preset = defaultPersonalDashboardLayout("general");
    const ids = preset.widgets.map((widget) => widget.id);
    expect(ids.indexOf("organic_conversions")).toBe(ids.indexOf("domain_rating") + 1);
    expect(preset.widgets).toContainEqual({
      id: "organic_conversions",
      span: "wide",
      visible: true,
    });
    expect(preset.widgets).toContainEqual({
      id: "seo_cost",
      span: "standard",
      visible: true,
    });
    const saved = presetDashboardLayout("general");
    const older = {
      ...saved,
      widgets: saved.widgets.filter(
        (widget) => widget.id !== "organic_conversions" && widget.id !== "seo_cost",
      ),
    };
    const completed = completeDashboardLayout(older);
    expect(completed.widgets).toContainEqual({
      id: "organic_conversions",
      span: "standard",
      visible: false,
    });
    expect(completed.widgets).toContainEqual({
      id: "seo_cost",
      span: "standard",
      visible: false,
    });
  });
});
