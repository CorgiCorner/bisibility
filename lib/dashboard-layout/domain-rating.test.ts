import { defaultPersonalDashboardLayout } from "@/lib/project-surface-preferences/dashboard-model";
import { describe, expect, it } from "vitest";
import { completeDashboardLayout, parseDashboardLayout } from "./layout";

describe("domain rating dashboard layout", () => {
  it("defaults to a visible full-width card", () => {
    expect(defaultPersonalDashboardLayout("general").widgets).toContainEqual({
      id: "domain_rating",
      visible: true,
      span: "wide",
    });
  });
  it.each(["standard", "wide"] as const)("retains a saved %s width", (span) => {
    const layout = defaultPersonalDashboardLayout("general");
    const widgets = layout.widgets.map((widget) =>
      widget.id === "domain_rating" ? { ...widget, span } : widget,
    );
    expect(parseDashboardLayout({ ...layout, widgets })?.widgets).toContainEqual({
      id: "domain_rating",
      visible: true,
      span,
    });
  });
  it("keeps the card hidden when completing an older saved layout", () => {
    const layout = defaultPersonalDashboardLayout("general");
    const widgets = layout.widgets.filter((widget) => widget.id !== "domain_rating");
    expect(completeDashboardLayout({ ...layout, widgets }).widgets).toContainEqual({
      id: "domain_rating",
      visible: false,
      span: "standard",
    });
  });
});
