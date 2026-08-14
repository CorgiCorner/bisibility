import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DataSourceStatusBadge } from "./DataSourceStatusBadge";
import { dataSourceStatusColor, dataSourceStatusTextColor } from "./data-source-status";

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

describe("DataSourceStatusBadge", () => {
  it("matches the compact bordered healthy badge from the current Dashboard design", () => {
    render(createElement(DataSourceStatusBadge, { status: "Provider healthy" }));
    const badge = screen.getByText("Provider healthy");

    expect(dataSourceStatusTextColor("Provider healthy")).toBe("var(--green-text)");
    expect(badge).toHaveClass("gap-1.5", "border", "px-[9px]", "py-[3px]", "text-[10.5px]");
    expect(badge.getAttribute("style")).toContain(
      "border-color: color-mix(in srgb, var(--green) 42%, transparent)",
    );
    expect(badge.getAttribute("style")).toContain("color: var(--green-text)");
  });
});
