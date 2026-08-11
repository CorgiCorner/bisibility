import { FirstCheckNoData } from "@/components/keyword-detail/empty/FirstCheckNoData";
import { KeywordContextAllUnknown } from "@/components/keyword-detail/empty/KeywordContextAllUnknown";
import { KeywordContextPartial } from "@/components/keyword-detail/empty/KeywordContextPartial";
import { PositionHistoryNoChecksInRange } from "@/components/keyword-detail/empty/PositionHistoryNoChecksInRange";
import { PositionHistoryOneCheck } from "@/components/keyword-detail/empty/PositionHistoryOneCheck";
import { SchedulePausedBudgetExhausted } from "@/components/keyword-detail/empty/SchedulePausedBudgetExhausted";
import {
  LandingPagePerformanceModule,
  SearchPerformanceAwaitingFirstSync,
} from "@/components/keyword-detail/empty/SearchPerformanceAwaitingFirstSync";
import { SearchPerformanceNotConnected } from "@/components/keyword-detail/empty/SearchPerformanceNotConnected";
import { TargetMismatchCannibalization } from "@/components/keyword-detail/empty/TargetMismatchCannibalization";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("keyword detail empty module states", () => {
  it("keeps the first check as one moment without Best or Previous cards", () => {
    render(<FirstCheckNoData nextCheckLabel="Aug 2 at 6:00 AM" trackedSince="Aug 1" />);

    expect(screen.getByText("Not found in top 20")).toBeVisible();
    expect(screen.getByText("Tracked since Aug 1")).toBeVisible();
    expect(screen.getByText("No ranking URL observed yet")).toBeVisible();
    expect(screen.getByText("First check collected")).toBeVisible();
    expect(screen.queryByText("Best")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
  });

  it("collapses entirely unknown metrics and drops missing partial metrics", () => {
    const { rerender } = render(<KeywordContextAllUnknown />);

    expect(screen.getByText("Keyword metrics unavailable from this provider.")).toBeVisible();
    expect(screen.queryByText("No data")).not.toBeInTheDocument();

    rerender(<KeywordContextPartial />);
    expect(screen.getByText("18k/mo")).toBeVisible();
    expect(screen.getByText("62")).toBeVisible();
    expect(screen.getByText("Medium")).toBeVisible();
    expect(screen.queryByText("CPC")).not.toBeInTheDocument();
  });

  it("keeps both empty chart states sized, labelled, and range-aware", () => {
    const { container, rerender } = render(
      <PositionHistoryOneCheck nextCheckLabel="Aug 2, 6:00 AM" />,
    );

    expect(screen.getByText("Not enough history to chart yet.")).toBeVisible();
    expect(screen.getByText("Current #3 | Next check Aug 2, 6:00 AM")).toBeVisible();
    expect(screen.getByLabelText("Single rank check point")).toHaveClass("left-[12.33%]");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(container.querySelector('[data-chart-height="180"]')).toBeInTheDocument();

    rerender(<PositionHistoryNoChecksInRange />);
    expect(screen.getByText("No checks in this range")).toBeVisible();
    expect(screen.getByText("No checks in the last 7 days.")).toBeVisible();
    expect(screen.getByText("Latest #3")).toBeVisible();
    expect(screen.getByText("Paused")).toBeVisible();
    expect(container.querySelector('[data-chart-height="280"]')).toBeInTheDocument();
  });

  it("shows independent Search Console connection and sync states", () => {
    const { rerender } = render(<SearchPerformanceNotConnected connectHref="/integrations" />);

    expect(
      screen.getByText(
        "Connect Search Console to see clicks, impressions and CTR for this keyword.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Connect Search Console" })).toHaveAttribute(
      "href",
      "/integrations",
    );

    rerender(<SearchPerformanceAwaitingFirstSync />);
    expect(screen.getByText("Awaiting first traffic sync.")).toBeVisible();
    expect(
      screen.getByText("Search Console data arrives with an approximately 3-day reporting lag."),
    ).toBeVisible();
  });

  it("does not render a landing-page shell when only one source has data", () => {
    const { container, rerender } = render(
      <LandingPagePerformanceModule dataSourceCount={1}>
        <div>Landing page performance</div>
      </LandingPagePerformanceModule>,
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <LandingPagePerformanceModule dataSourceCount={2}>
        <div>Landing page performance</div>
      </LandingPagePerformanceModule>,
    );
    expect(screen.getByText("Landing page performance")).toBeVisible();
  });

  it("shows target mismatch, cannibalization, and a persistent paused-budget banner", () => {
    const { container, rerender } = render(<TargetMismatchCannibalization />);

    expect(screen.getByText("/blog/headless-cms-guide")).toBeVisible();
    expect(screen.getByText("Target mismatch")).toBeVisible();
    expect(screen.getByText("Expected")).toBeVisible();
    expect(screen.getByText("/headless-cms")).toBeVisible();
    expect(screen.getByText("2 URLs ranking")).toBeVisible();
    expect(screen.getByText("Cannibalization")).toBeVisible();

    rerender(<SchedulePausedBudgetExhausted />);
    expect(screen.getByText("Paused - migration hold")).toBeVisible();
    expect(screen.getByRole("button", { name: "Run check" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveAttribute("data-persistent-inline-banner");
    expect(screen.getByText("Monthly provider budget reached")).toBeVisible();
    expect(container.querySelector("[data-persistent-inline-banner]")).toBeInTheDocument();
  });

  it("never renders a zero position or a bare dash for a missing observation", () => {
    render(
      <>
        <FirstCheckNoData />
        <KeywordContextAllUnknown />
        <KeywordContextPartial />
        <PositionHistoryOneCheck position={0} />
        <PositionHistoryNoChecksInRange latestPosition={0} />
        <SearchPerformanceNotConnected />
        <SearchPerformanceAwaitingFirstSync />
        <TargetMismatchCannibalization />
        <SchedulePausedBudgetExhausted />
      </>,
    );

    expect(screen.queryByText("#0")).not.toBeInTheDocument();
    expect(screen.queryByText(/^-$/)).not.toBeInTheDocument();
  });
});
