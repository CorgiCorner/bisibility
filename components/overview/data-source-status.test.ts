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

describe("DataSourcePanel", () => {
  it("places the provider state beside the primary provider instead of the card heading", () => {
    const health = {
      ...overviewFixture.dataSource,
      metrics: overviewFixture.dataSource.metrics.map((metric, index) =>
        index === 0 ? { ...metric, label: "Primary provider" } : metric,
      ),
    };
    render(createElement(DataSourcePanel, { health }));

    const primaryProvider = screen.getByText("Primary provider").parentElement;
    const header = screen.getByText("Data source").closest("div.flex.flex-wrap.items-start");

    expect(primaryProvider).toHaveTextContent("DataForSEOHealthy");
    expect(header).not.toHaveTextContent("Healthy");
  });
});
