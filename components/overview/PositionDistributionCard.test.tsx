import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PositionDistributionCard } from "./PositionDistributionCard";

describe("PositionDistributionCard", () => {
  it("uses the chart-bar icon for its empty state", () => {
    const { container } = render(<PositionDistributionCard buckets={[]} empty />);

    expect(container.querySelector('[data-icon="ChartBarIcon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-icon="ChartLineUpIcon"]')).not.toBeInTheDocument();
  });

  it("exposes every count, including zero, to keyboard and screen reader users", () => {
    render(
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
    expect(
      screen.getByRole("button", { name: "Positions 1 to 3: 1 keywords" }),
    ).toBeInTheDocument();
  });
});
