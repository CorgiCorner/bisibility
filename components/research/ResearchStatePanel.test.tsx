import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type ResearchState, ResearchStatePanel } from "./ResearchStatePanel";

const expected: Array<[ResearchState, RegExp]> = [
  ["idle", /research starts with a seed/i],
  ["loading", /research loading/i],
  ["no_provider", /keyword research needs a provider/i],
  ["budget_exhausted", /monthly provider budget reached/i],
  ["needs_reauth", /needs to be reconnected/i],
  ["lookup_failed", /lookup did not go through/i],
  ["empty", /no keyword ideas found/i],
  ["unsupported_location", /market is not supported/i],
];

describe("ResearchStatePanel", () => {
  it.each(expected)("renders the %s state", (state, label) => {
    render(<ResearchStatePanel projectRef="prj_1" state={state} />);
    expect(
      state === "loading" ? screen.getByLabelText(label) : screen.getByText(label),
    ).toBeInTheDocument();
  });

  it("deep-links the exhausted budget to the budget editor with docs secondary", () => {
    render(<ResearchStatePanel projectRef="prj_1" state="budget_exhausted" />);
    expect(screen.getByRole("link", { name: "Raise the budget" })).toHaveAttribute(
      "href",
      "/app/prj_1/settings#provider-usage",
    );
    expect(screen.getByRole("link", { name: "How budgets work" })).toHaveAttribute(
      "href",
      "https://bisibility.com/docs/integrations#budget-cap",
    );
  });

  it("only promises no charge when the failed lookup reports none", () => {
    const { rerender } = render(
      <ResearchStatePanel charged={false} projectRef="prj_1" state="lookup_failed" />,
    );
    expect(screen.getByText(/weren't charged for the failed attempt/i)).toBeInTheDocument();

    rerender(<ResearchStatePanel charged projectRef="prj_1" state="lookup_failed" />);
    expect(screen.queryByText(/weren't charged for the failed attempt/i)).not.toBeInTheDocument();
    expect(screen.getByText(/reported a charge before it failed/i)).toBeInTheDocument();
  });

  it("explains the idle workflow in three steps", () => {
    render(<ResearchStatePanel projectRef="prj_1" state="idle" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.queryByRole("link", { name: /choose your first keywords/i }),
    ).not.toBeInTheDocument();
  });

  it("offers Auto as an empty-state recovery only for specific modes", () => {
    const { rerender } = render(
      <ResearchStatePanel mode="ideas" projectRef="prj_1" state="empty" />,
    );
    expect(screen.getByText(/switch mode to auto/i)).toBeInTheDocument();

    rerender(<ResearchStatePanel mode="auto" projectRef="prj_1" state="empty" />);
    expect(screen.queryByText(/switch mode to auto/i)).not.toBeInTheDocument();
  });
});
