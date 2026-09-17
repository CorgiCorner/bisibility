import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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
});
