import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen } from "@testing-library/react";
import { act, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { PositionDistributionCard } from "./PositionDistributionCard";

describe("PositionDistributionCard", () => {
  function renderDashboard(children: ReactNode) {
    return render(<ProjectDashboardMessages>{children}</ProjectDashboardMessages>);
  }

  it("uses the chart-bar icon for its empty state", () => {
    const { container } = renderDashboard(<PositionDistributionCard buckets={[]} empty />);

    expect(container.querySelector('[data-icon="ChartBarIcon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-icon="ChartLineUpIcon"]')).not.toBeInTheDocument();
  });

  it("exposes every count, including zero, to keyboard and screen reader users", () => {
    renderDashboard(
      <PositionDistributionCard
        buckets={[
          { color: "green", count: 1, label: "#1-3" },
          { color: "blue", count: 0, label: "#4-10" },
          { color: "purple", count: 0, label: "#11-20" },
          { color: "yellow", count: 0, label: "#21-50" },
          { color: "red", count: 0, label: "#51-100" },
        ]}
      />,
    );

    const emptyBucket = screen.getByRole("button", { name: "Positions 4 to 10: 0 keywords" });
    expect(emptyBucket).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Positions 1 to 3: 1 keyword" })).toBeInTheDocument();
  });

  it("centres each count on its bar and fills the card height", () => {
    const observers = stubResizeObserver();
    const { container } = renderDashboard(
      <PositionDistributionCard
        buckets={[
          { color: "green", count: 18, label: "#1-3" },
          { color: "blue", count: 2, label: "#4-10" },
          { color: "purple", count: 0, label: "#11-20" },
          { color: "yellow", count: 0, label: "#21-50" },
          { color: "red", count: 0, label: "#51-100" },
        ]}
      />,
    );
    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 320, width: 600 } } as ResizeObserverEntry]);
      }
    });

    const plot = container.querySelector("[data-distribution-plot]");
    expect(plot).toHaveClass("flex-1");
    expect(plot?.querySelector("section")).toHaveClass("absolute");
    expect(
      container.querySelectorAll(".recharts-cartesian-grid-horizontal line").length,
    ).toBeGreaterThanOrEqual(3);

    const labels = [...container.querySelectorAll("[data-chart-counts] text")];
    const bars = [...container.querySelectorAll(".recharts-bar-rectangle")];
    expect(labels).toHaveLength(5);
    expect(bars).toHaveLength(5);
    expect(labels.filter((label) => label.textContent === "0")).toHaveLength(3);
    expect(labels.find((label) => label.textContent === "0")).toHaveAttribute(
      "fill",
      "var(--fg-muted)",
    );
    for (const [index, label] of labels.entries()) {
      const bar = bars[index]?.querySelector("path, rect");
      const labelX = Number(label.getAttribute("x"));
      const barX = Number(bar?.getAttribute("x"));
      const barWidth = Number(bar?.getAttribute("width"));
      expect(barWidth).toBeLessThanOrEqual(48);
      expect(labelX).toBeCloseTo(barX + barWidth / 2, 0);
    }

    fireEvent.focus(screen.getByRole("button", { name: /Positions 1 to 3/ }));
    expect(screen.getByText("18 keywords · 90%")).toBeInTheDocument();
  });
});
