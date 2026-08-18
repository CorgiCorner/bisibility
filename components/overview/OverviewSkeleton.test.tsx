import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewPageLoading, OverviewSkeleton } from "./OverviewSkeleton";

describe("OverviewSkeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<OverviewSkeleton />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the full-bleed toolbar with filter pills and add action", () => {
    const { container } = render(<OverviewSkeleton />);
    const toolbar = container.querySelector(".-mx-4.-mt-4");
    expect(toolbar).not.toBeNull();
    const pills = toolbar?.querySelectorAll(".rounded-full");
    expect(pills?.length).toBeGreaterThanOrEqual(3);
    const action = toolbar?.querySelector(".flex-none");
    expect(action).not.toBeNull();
  });

  it("mirrors four KPI cards with label, value, and delta internals", () => {
    render(<OverviewSkeleton />);
    const kpiSection = screen.getByTestId("overview-kpis");
    const kpiCards = kpiSection.querySelectorAll(".rounded-\\[13px\\]");
    expect(kpiCards).toHaveLength(4);
    for (const card of kpiCards) {
      const bars = card.querySelectorAll(".animate-pulse");
      expect(bars.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("mirrors the trend and distribution chart row", () => {
    const { container } = render(<OverviewSkeleton />);
    const chartSection = container.querySelector(
      ".lg\\:grid-cols-\\[minmax\\(0\\,1\\.85fr\\)_minmax\\(0\\,1fr\\)\\]",
    );
    expect(chartSection).not.toBeNull();
    const chartCards = chartSection?.querySelectorAll(".rounded-\\[14px\\]");
    expect(chartCards).toHaveLength(2);
    const trendChart = chartCards?.[0]?.querySelector(".h-\\[250px\\]");
    expect(trendChart).not.toBeNull();
    const distBars = chartCards?.[1]?.querySelectorAll(".items-end > .animate-pulse");
    expect(distBars?.length).toBe(6);
  });

  it("mirrors the by-market rollup with header and table rows", () => {
    render(<OverviewSkeleton />);
    const rollup = screen.getByTestId("by-market-rollup");
    const gridRows = rollup.querySelectorAll(".min-w-\\[772px\\]");
    expect(gridRows.length).toBe(4);
  });

  it("mirrors the data-source panel with metrics and note footer", () => {
    const { container } = render(<OverviewSkeleton />);
    const panels = container.querySelectorAll(".px-5.py-4\\.5");
    const dataSourcePanel = panels[panels.length - 1];
    expect(dataSourcePanel).not.toBeUndefined();
    const metrics = dataSourcePanel.querySelectorAll(
      ".grid-cols-\\[repeat\\(auto-fit\\,minmax\\(140px\\,1fr\\)\\)\\] > div",
    );
    expect(metrics).toHaveLength(4);
    const footer = dataSourcePanel.querySelector(".border-t.border-border-soft");
    expect(footer).not.toBeNull();
  });

  it("mirrors four highlight-list cards with header and rows", () => {
    const { container } = render(<OverviewSkeleton />);
    const highlightGrid = container.querySelector(
      ".grid-cols-\\[repeat\\(auto-fit\\,minmax\\(300px\\,1fr\\)\\)\\]",
    );
    expect(highlightGrid).not.toBeNull();
    const cards = highlightGrid?.querySelectorAll(".rounded-\\[14px\\]");
    expect(cards).toHaveLength(4);
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
    const rounded10 = container.querySelectorAll(".rounded-\\[10px\\]");
    expect(rounded10.length).toBeGreaterThan(0);
    const rounded8 = container.querySelectorAll(".rounded-\\[8px\\]");
    expect(rounded8).toHaveLength(0);
    const rounded9 = container.querySelectorAll(".rounded-\\[9px\\]");
    expect(rounded9).toHaveLength(0);
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
