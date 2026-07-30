import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordTrafficCard } from "./KeywordTrafficCard";

describe("KeywordTrafficCard", () => {
  it("shows a Search Console connection action when analytics is not connected", () => {
    render(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{ hasAnalyticsConnection: false, pages: [], query: null }}
      />,
    );

    expect(screen.getByText("Search & page stats")).toBeInTheDocument();
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

  it("shows the first-sync wait and reporting lag when analytics is connected", () => {
    render(
      <KeywordTrafficCard
        projectRef="prj_1"
        traffic={{ hasAnalyticsConnection: true, pages: [], query: null }}
      />,
    );

    expect(screen.getByText("Awaiting first traffic sync.")).toBeInTheDocument();
    expect(screen.getByText(/approximately 3-day reporting lag/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect Search Console" })).toBeNull();
  });
});
