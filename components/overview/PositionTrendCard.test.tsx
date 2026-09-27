import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-dashboard.json";
import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PositionTrendCard } from "./PositionTrendCard";

const { lineChart } = vi.hoisted(() => ({ lineChart: vi.fn() }));

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  TimeSeriesChart: (props: unknown) => {
    lineChart(props);
    return <div data-testid="line-chart" />;
  },
}));

function withMessages(children: ReactNode) {
  return (
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </FeatureMessagesProvider>
  );
}

function renderTrend(props: ComponentProps<typeof PositionTrendCard>) {
  return render(withMessages(<PositionTrendCard {...props} />));
}

describe("PositionTrendCard", () => {
  it("retains the chart-line-up icon for its empty state", () => {
    const { container } = renderTrend({ data: [], empty: true });

    expect(container.querySelector('[data-icon="ChartLineUpIcon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-icon="ChartBarIcon"]')).not.toBeInTheDocument();
  });

  it("plots a single recorded day instead of asking for another check", () => {
    renderTrend({ data: [{ label: null, value: 1 }] });

    expect(screen.queryByText("Trend appears after the next check")).not.toBeInTheDocument();
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({ series: [expect.objectContaining({ values: [1], dots: true })] }),
    );
  });

  it("shows the definition and a separate takeaway below the title", () => {
    const takeaway: NonNullable<ComponentProps<typeof PositionTrendCard>["takeaway"]> = {
      days: 21,
      kind: "slipped",
      value: 0.8,
      window: "firstTrackedDays",
    };
    renderTrend({
      data: [
        { dateKey: "2026-07-16", label: "2026-07-16", value: 3 },
        { dateKey: "2026-07-17", label: null, value: 2 },
      ],
      takeaway,
    });

    expect(lineChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dateKeys: ["2026-07-16", ""],
        labels: ["2026-07-16", "now"],
        margin: { top: 12, right: 16, bottom: 0, left: 16 },
        yWidth: 20,
      }),
    );
    expect(
      screen.getByRole("region", {
        name: "Position trend chart. Average position slipped 0.8 in the first 21 days of tracking.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Average position slipped 0.8 in the first 21 days of tracking.", {
        selector: "p",
      }),
    ).toBeVisible();
    const definition = screen.getByText(
      "Daily average position of ranked keywords. Lower is better - #1 is the top.",
      { selector: "p" },
    );
    const renderedTakeaway = screen.getByText(
      "Average position slipped 0.8 in the first 21 days of tracking.",
      { selector: "p" },
    );
    expect(definition).toBeVisible();
    expect(renderedTakeaway).toBeVisible();
    expect(definition).not.toBe(renderedTakeaway);
    expect(
      screen
        .getByRole("heading", { name: "Position trend" })
        .closest("[data-overview-chart-header]"),
    ).toHaveClass("min-h-[96px]");
    expect(
      screen.queryByRole("button", {
        name: "Daily average position of ranked keywords. Lower is better - #1 is the top.",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /21 days/ })).not.toBeInTheDocument();
  });

  it("renders no takeaway line without a takeaway or enough history", () => {
    const { container, rerender } = renderTrend({
      data: [
        { label: "2026-07-16", value: 3 },
        { label: null, value: 2 },
      ],
    });

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(
      screen
        .getByRole("heading", { name: "Position trend" })
        .closest("[data-overview-chart-header]"),
    ).toHaveClass("min-h-[96px]");

    rerender(
      withMessages(
        <PositionTrendCard
          data={[{ label: null, value: 2 }]}
          takeaway={{ days: 21, kind: "slipped", value: 0.8, window: "firstTrackedDays" }}
        />,
      ),
    );

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.queryByText(/21 days/)).not.toBeInTheDocument();
  });

  it("renders the takeaway loading treatment below the title", () => {
    const { container } = renderTrend({
      data: [
        { label: "2026-07-16", value: 3 },
        { label: "now", value: 2 },
      ],
      takeawayLoading: true,
    });

    expect(container.querySelector("div[aria-hidden].animate-pulse")).toBeInTheDocument();
  });
});
