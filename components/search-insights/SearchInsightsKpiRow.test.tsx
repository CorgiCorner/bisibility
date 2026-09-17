import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchInsightsKpiRow } from "./SearchInsightsKpiRow";

const kpis = [
  {
    delta: { kind: "changed" as const, unit: "percent_change" as const, value: 0.1 },
    dir: "up" as const,
    metric: "clicks" as const,
    previous: 9,
    source: "gsc" as const,
    value: 10,
    valueKind: "count" as const,
  },
  {
    delta: { kind: "changed" as const, unit: "percent_change" as const, value: 0.1 },
    dir: "up" as const,
    metric: "impressions" as const,
    previous: 9,
    source: "gsc" as const,
    value: 10,
    valueKind: "count" as const,
  },
  {
    delta: { kind: "changed" as const, unit: "percent_change" as const, value: 0.1 },
    dir: "up" as const,
    metric: "ctr" as const,
    previous: 0.09,
    source: "gsc" as const,
    value: 0.1,
    valueKind: "percentage" as const,
  },
  {
    delta: { kind: "changed" as const, unit: "position" as const, value: 1 },
    dir: "up" as const,
    metric: "position" as const,
    previous: 9,
    source: "gsc" as const,
    value: 10,
    valueKind: "position" as const,
  },
];

describe("SearchInsightsKpiRow", () => {
  it("renders a new uncovered-baseline KPI without an arrow", () => {
    const { container } = render(
      <SearchInsightsKpiRow
        kpis={[
          {
            delta: { kind: "new" },
            dir: "flat",
            metric: "clicks",
            previous: null,
            source: "gsc",
            value: 10,
            valueKind: "count",
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
            delta: { kind: "changed", unit: "percentage_points", value: 0.04 },
            dir: "up",
            metric: "clicks_to_sessions",
            previous: 0.88,
            source: "gsc",
            value: 0.92,
            valueKind: "percentage",
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
            delta: { kind: "new" },
            dir: "flat",
            metric: "clicks_to_sessions",
            previous: null,
            source: "gsc",
            value: 0.92,
            valueKind: "percentage",
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
        extra={{ kind: "hidden", reason: "zero_clicks", source: "gsc" }}
        kpis={kpis}
      />,
    );

    expect(
      screen.getByText("No Google clicks in this window - nothing to reconcile"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Clicks to sessions")).not.toBeInTheDocument();
  });
});
