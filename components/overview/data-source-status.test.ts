import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DataSourcePanel } from "./DataSourcePanel";
import { DataSourceStatusBadge } from "./DataSourceStatusBadge";
import {
  dataSourceStatusColor,
  dataSourceStatusLabel,
  dataSourceStatusTextColor,
} from "./data-source-status";
import { DataSourceNoDataPanel } from "./OverviewNoDataBottom";
import { overviewFixture } from "./overview-fixtures";

describe("dataSourceStatusColor", () => {
  it.each([
    ["Provider healthy", "var(--green)"],
    ["Provider not connected", "var(--fg-muted)"],
    ["Provider disconnected", "var(--fg-muted)"],
    ["Migration hold active", "var(--yellow)"],
    ["Provider failed", "var(--red)"],
  ])("maps %s to %s", (status, color) => {
    expect(dataSourceStatusColor(status)).toBe(color);
  });
});

describe("dataSourceStatusLabel", () => {
  it.each([
    ["Provider healthy", "Healthy"],
    ["Provider needs attention", "Needs attention"],
    ["Provider not connected", "Not connected"],
    ["Migration hold active", "Migration hold active"],
    ["Provider failed", "Failed"],
  ])("localizes %s as %s", (status, label) => {
    expect(dataSourceStatusLabel(status)).toBe(label);
  });
});

describe("DataSourceStatusBadge", () => {
  it("renders the healthy provider state as compact secondary metadata", () => {
    render(createElement(DataSourceStatusBadge, { status: "Provider healthy" }));
    const badge = screen.getByText("Healthy");

    expect(screen.queryByText("Provider healthy")).not.toBeInTheDocument();
    expect(dataSourceStatusTextColor("Provider healthy")).toBe("var(--green-text)");
    expect(badge).toHaveClass("gap-1", "p-0", "text-[10px]");
    expect(badge).not.toHaveClass("border", "rounded-full");
    expect(badge.getAttribute("style")).toContain("color: var(--green-text)");
  });
});

describe("DataSourceNoDataPanel", () => {
  it("keeps the data source card while omitting the provider billing note", () => {
    render(
      createElement(DataSourceNoDataPanel, {
        health: {
          ...overviewFixture.dataSource,
          note: "Provider billing remains direct between you and the provider.",
        },
      }),
    );

    expect(screen.getByText("Data source")).toBeInTheDocument();
    expect(
      screen.queryByText("Provider billing remains direct between you and the provider."),
    ).not.toBeInTheDocument();
  });
});

describe("DataSourcePanel", () => {
  it("omits redundant provider health and billing-note copy", () => {
    const health = {
      ...overviewFixture.dataSource,
      metrics: overviewFixture.dataSource.metrics.map((metric, index) =>
        index === 0 ? { ...metric, label: "Primary provider" } : metric,
      ),
      note: "Provider billing remains direct between you and the provider.",
    };
    render(createElement(DataSourcePanel, { health }));

    const primaryProvider = screen.getByText("Primary provider").parentElement;
    expect(primaryProvider).toHaveTextContent("DataForSEO");
    expect(primaryProvider).not.toHaveTextContent("Healthy");
    expect(
      screen.queryByText("Provider billing remains direct between you and the provider."),
    ).toBeNull();
  });
});
