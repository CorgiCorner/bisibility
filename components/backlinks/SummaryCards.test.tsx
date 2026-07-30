import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";
import { SummaryCards } from "./SummaryCards";

describe("SummaryCards", () => {
  it("derives both 30d badges from the latest history month", () => {
    render(
      <SummaryCards
        history={backlinksSnapshotFixture.history}
        summary={backlinksSnapshotFixture.summary}
      />,
    );

    expect(screen.getByText("+34 / 30d")).toBeInTheDocument();
    expect(screen.getByText("+2 / 30d")).toBeInTheDocument();
    expect(screen.queryByText("+900 / 30d")).not.toBeInTheDocument();
    for (const chart of screen.getAllByRole("img", { name: /12 month trend/ })) {
      expect(chart).toHaveStyle({ width: "100%" });
    }
  });

  it("computes the 12 month net and biggest-loss footer from history", () => {
    render(
      <SummaryCards
        history={backlinksSnapshotFixture.history}
        summary={backlinksSnapshotFixture.summary}
      />,
    );

    expect(screen.getByText("+257")).toBeInTheDocument();
    expect(screen.getByText(/biggest loss: 14 in April/)).toBeInTheDocument();
  });
});
