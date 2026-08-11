import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordTrafficCard } from "./KeywordTrafficCard";

describe("KeywordTrafficCard", () => {
  const query = {
    clicks: 12,
    ctr: 0.1,
    date: new Date("2026-08-10T00:00:00.000Z"),
    impressions: 120,
    position: 3,
    provider: "gsc",
    windowDays: 28,
  };

  const page = {
    bounceRate: null,
    date: query.date,
    engagementRate: null,
    keyEvents: null,
    path: "/headless-cms",
    provider: "ga4",
    scrollDepth: null,
    sessions: 8,
    visitDurationSeconds: null,
    visitors: null,
    windowDays: 28,
  };

  it("keeps Search Console-only data separate from landing page performance", () => {
    const { rerender } = render(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{
          hasAnalyticsConnection: true,
          hasSearchConsoleConnection: true,
          pages: [],
          query,
        }}
        trafficState="gsc_only"
      />,
    );

    expect(screen.getByText("Search performance")).toBeInTheDocument();
    expect(screen.queryByText("Landing page performance")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "GSC position is an average across real impressions and may differ from the latest rank check.",
      ),
    ).toBeInTheDocument();

    rerender(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{
          hasAnalyticsConnection: true,
          hasSearchConsoleConnection: true,
          pages: [page],
          query,
        }}
        trafficState="both"
      />,
    );

    expect(screen.getByText("Landing page performance")).toBeInTheDocument();
  });

  it("shows a Search Console connection action when analytics is not connected", () => {
    render(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{ hasAnalyticsConnection: false, pages: [], query: null }}
      />,
    );

    expect(screen.getByText("Search performance")).toBeInTheDocument();
    expect(screen.getByText("Trailing 28 days")).toBeInTheDocument();
    expect(screen.getByText("Search Console")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Connect Search Console to see clicks, impressions and CTR for this keyword.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Search Console" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
  });

  it("shows the first-sync wait and reporting lag only when Search Console is connected", () => {
    render(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{
          hasAnalyticsConnection: true,
          hasSearchConsoleConnection: true,
          pages: [],
          query: null,
        }}
      />,
    );

    expect(screen.getByText("Awaiting first traffic sync.")).toBeInTheDocument();
    expect(screen.getByText("Trailing 28 days")).toBeInTheDocument();
    expect(screen.getByText(/approximately 3-day reporting lag/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect Search Console" })).toBeNull();
  });

  it("uses an explicit Search Console state instead of the generic analytics connection", () => {
    render(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{
          hasAnalyticsConnection: true,
          hasSearchConsoleConnection: false,
          pages: [],
          query: null,
        }}
        trafficState="not_connected"
      />,
    );

    expect(screen.getByRole("link", { name: "Connect Search Console" })).toBeInTheDocument();
    expect(screen.queryByText("Awaiting first traffic sync.")).not.toBeInTheDocument();
  });

  it("labels Plausible page traffic as Pageviews and GA4 traffic as Sessions", () => {
    render(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{
          hasAnalyticsConnection: true,
          hasSearchConsoleConnection: true,
          pages: [page, { ...page, provider: "plausible", sessions: 12 }],
          query,
        }}
        trafficState="both"
      />,
    );

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Pageviews")).toBeInTheDocument();
  });
});
