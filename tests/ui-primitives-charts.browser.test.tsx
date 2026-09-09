/// <reference types="vite/client" />
import "@/app/globals.css";
import { Sparkline } from "@/components/charts/Sparkline";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { PositionDistributionCard } from "@/components/overview/PositionDistributionCard";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("Chart layout contracts", () => {
  it("draws incomplete sparkline history within the supplied dimensions", async () => {
    const { container } = render(<Sparkline ariaLabel="Volume trend" data={[10, null, 20]} />);
    await waitFor(() => expect(container.querySelector(".recharts-line-curve")).not.toBeNull());
    const line = container.querySelector(".recharts-line-curve") as SVGPathElement;
    expect(line.getAttribute("d")).not.toMatch(/NaN/);
    expect(line.getBBox().width).toBeGreaterThan(0);
    expect(line.getBBox().height).toBeLessThanOrEqual(34);
  });

  it("keeps gaps and displays better ranks above worse ranks", async () => {
    const { container } = render(
      <div style={{ width: 600 }}>
        <TimeSeriesChart
          labels={["A", "B", "C", "D", "E"]}
          series={[{ label: "Position", color: "var(--accent)", values: [1, 10, null, 30, 40] }]}
          height={240}
          min={1}
          max={100}
          reversed
        />
      </div>,
    );
    await waitFor(() => expect(container.querySelector(".recharts-line-curve")).not.toBeNull());
    const path = container.querySelector(".recharts-line-curve") as SVGPathElement;
    expect(path.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(path.getPointAtLength(0).y).toBeLessThan(path.getPointAtLength(path.getTotalLength()).y);
  });

  it("places every distribution count, including zeros, above the bar baseline", async () => {
    const { container } = render(
      <div style={{ width: 600 }}>
        <PositionDistributionCard
          buckets={[
            { color: "green", count: 1, label: "#1-3" },
            { color: "blue", count: 0, label: "#4-10" },
            { color: "purple", count: 0, label: "#11-20" },
            { color: "yellow", count: 0, label: "#21-50" },
            { color: "red", count: 0, label: "#51-100" },
          ]}
        />
      </div>,
    );
    await waitFor(() =>
      expect(container.querySelectorAll("[data-chart-counts] text").length).toBe(5),
    );
    const labels = Array.from(container.querySelectorAll("[data-chart-counts] text"));
    expect(labels.map((label) => label.textContent)).toEqual(["1", "0", "0", "0", "0"]);
    expect(Number(labels[0].getAttribute("y"))).toBeLessThan(Number(labels[1].getAttribute("y")));
    expect(labels.every((label) => Number(label.getAttribute("y")) > 0)).toBe(true);
  });
});
