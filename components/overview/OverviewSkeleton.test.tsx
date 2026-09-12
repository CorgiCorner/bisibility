import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewPageLoading, OverviewSkeleton } from "./OverviewSkeleton";

describe("OverviewSkeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<OverviewSkeleton />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the full-bleed toolbar with range/tag selects and add action", () => {
    const { container } = render(<OverviewSkeleton />);
    const toolbar = container.querySelector(".-mx-4.-mt-4");
    expect(toolbar).not.toBeNull();
    const selects = toolbar?.querySelectorAll(".h-9");
    expect(selects?.length).toBe(2);
    const action = toolbar?.querySelector(".flex-none");
    expect(action).not.toBeNull();
  });

  it("mirrors four KPI cards with label, value, and delta internals", () => {
    render(<OverviewSkeleton />);
    const kpiSection = screen.getByTestId("overview-kpis");
    const kpiCards = kpiSection.querySelectorAll(".rounded-card");
    expect(kpiCards).toHaveLength(4);
    for (const card of kpiCards) {
      const bars = card.querySelectorAll(".animate-pulse");
      expect(bars.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("mirrors the full-width trend and the distribution plus recently-added row", () => {
    render(<OverviewSkeleton />);
    expect(screen.getByTestId("overview-trend").querySelector(".h-\\[250px\\]")).not.toBeNull();
    const split = screen.getByTestId("overview-secondary-cards");
    expect(split.querySelectorAll(":scope > .rounded-card")).toHaveLength(2);
    expect(split.querySelectorAll(".items-end > .animate-pulse")).toHaveLength(6);
    expect(split).toContainElement(screen.getByTestId("overview-recently-added"));
  });

  it("mirrors the by-market rollup with header and table rows", () => {
    render(<OverviewSkeleton />);
    const rollup = screen.getByTestId("by-market-rollup");
    const gridRows = rollup.querySelectorAll(".min-w-\\[772px\\]");
    expect(gridRows.length).toBe(4);
  });

  it("mirrors the data-source panel with metrics and note footer", () => {
    render(<OverviewSkeleton />);
    const dataSourcePanel = screen.getByTestId("overview-data-source");
    const metrics = dataSourcePanel.querySelectorAll(
      ".grid-cols-\\[repeat\\(auto-fit\\,minmax\\(140px\\,1fr\\)\\)\\] > div",
    );
    expect(metrics).toHaveLength(4);
    expect(dataSourcePanel.querySelector(".border-t.border-border")).not.toBeNull();
  });

  it("mirrors recently added beside distribution and the remaining highlight-list cards later", () => {
    render(<OverviewSkeleton />);
    const recentlyAdded = screen.getByTestId("overview-recently-added");
    expect(recentlyAdded.querySelectorAll(".min-h-\\[68px\\]")).toHaveLength(3);
    const highlightGrid = screen
      .getByTestId("by-market-rollup")
      .parentElement?.querySelector(
        ".grid-cols-\\[repeat\\(auto-fit\\,minmax\\(300px\\,1fr\\)\\)\\]",
      );
    expect(highlightGrid).not.toBeNull();
    const cards = highlightGrid?.querySelectorAll(".rounded-card");
    expect(cards).toHaveLength(3);
    for (const card of cards ?? []) {
      const header = card.querySelector(".px-4\\.5");
      expect(header).not.toBeNull();
      const rows = card.querySelectorAll(".min-h-\\[68px\\]");
      expect(rows.length).toBe(3);
      for (const row of rows ?? []) {
        const leftBars = row.querySelector(".min-w-0")?.querySelectorAll(".animate-pulse");
        expect(leftBars?.length).toBe(3);
      }
    }
  });

  it("renders the final action with self-start alignment", () => {
    const { container } = render(<OverviewSkeleton />);
    const action = container.querySelector(".self-start");
    expect(action).not.toBeNull();
    expect(action?.className).toContain("rounded-full");
  });

  it("uses a consistent bar radius across the skeleton", () => {
    const { container } = render(<OverviewSkeleton />);
    expect(container.querySelectorAll(".rounded-control").length).toBeGreaterThan(0);
    // The scale has two steps, so a skeleton bar may only wear a role class.
    const strays = container.querySelectorAll('[class*="rounded-["]');
    expect(strays).toHaveLength(0);
  });
});

describe("OverviewPageLoading", () => {
  it("wraps the skeleton in PageContent with aria-hidden", () => {
    const { container } = render(<OverviewPageLoading />);
    const pageContent = container.firstElementChild;
    expect(pageContent).not.toBeNull();
    expect(pageContent?.getAttribute("aria-hidden")).toBe("true");
    expect(pageContent?.className).toContain("mx-auto");
  });
});
