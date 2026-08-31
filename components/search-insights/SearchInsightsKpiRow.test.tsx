import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchInsightsKpiRow } from "./SearchInsightsKpiRow";

const kpis = [
  { delta: "+1%", dir: "up" as const, label: "Clicks", prev: "9", source: "GSC", value: "10" },
  { delta: "+1%", dir: "up" as const, label: "Impressions", prev: "9", source: "GSC", value: "10" },
  { delta: "+1%", dir: "up" as const, label: "CTR", prev: "9", source: "GSC", value: "10" },
  {
    delta: "+1%",
    dir: "up" as const,
    label: "Average position",
    prev: "9",
    source: "GSC",
    value: "10",
  },
];

describe("SearchInsightsKpiRow", () => {
  it("uses the five-card grid when a connected sessions source supplies its KPI", () => {
    const { container } = render(
      <SearchInsightsKpiRow
        extra={{
          delta: "+2%",
          dir: "up",
          label: "Organic sessions",
          prev: "8",
          source: "GA4",
          value: "10",
        }}
        kpis={kpis}
      />,
    );

    expect(screen.getByText("Organic sessions")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("lg:grid-cols-5");
  });
});
