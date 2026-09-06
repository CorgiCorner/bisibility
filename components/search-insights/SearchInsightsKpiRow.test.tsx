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
  it("renders a new uncovered-baseline KPI without an arrow", () => {
    const { container } = render(
      <SearchInsightsKpiRow
        kpis={[
          {
            delta: "new",
            dir: "flat",
            label: "Clicks",
            prev: "no data",
            source: "GSC",
            value: "10",
          },
        ]}
      />,
    );

    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByText("from no data")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("uses the five-card grid when a connected sessions source supplies its KPI", () => {
    const { container } = render(
      <SearchInsightsKpiRow
        extra={{
          kind: "visible",
          kpi: {
            delta: "+4.00 pp",
            dir: "up",
            label: "Clicks to sessions",
            prev: "88.00%",
            source: "GSC",
            value: "92.00%",
          },
        }}
        kpis={kpis}
      />,
    );

    expect(screen.getByText("Clicks to sessions")).toBeInTheDocument();
    expect(screen.getByText("+4.00 pp")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("lg:grid-cols-5");
  });

  it("renders the uncovered-baseline affordance for a visible click-to-session KPI", () => {
    render(
      <SearchInsightsKpiRow
        extra={{
          kind: "visible",
          kpi: {
            delta: "new",
            dir: "flat",
            label: "Clicks to sessions",
            prev: "no data",
            source: "GSC",
            value: "92.00%",
          },
        }}
        kpis={kpis}
      />,
    );

    expect(screen.getByText("Clicks to sessions")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByText("from no data")).toBeInTheDocument();
  });

  it("replaces a hidden click-to-session card with its reconciliation reason", () => {
    render(
      <SearchInsightsKpiRow
        extra={{ kind: "hidden", reason: "zero_clicks", source: "GSC" }}
        kpis={kpis}
      />,
    );

    expect(
      screen.getByText("No Google clicks in this window - nothing to reconcile"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Clicks to sessions")).not.toBeInTheDocument();
  });
});
