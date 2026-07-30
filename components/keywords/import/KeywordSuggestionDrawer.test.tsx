import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordSuggestionDrawer, type SuggestionCostContext } from "./KeywordSuggestionDrawer";

const costContext: SuggestionCostContext = {
  cronExpression: null,
  depth: 100,
  deviceCount: 1,
  frequency: "daily",
  locationCount: 1,
  overrideCents: 200,
  providerId: "dataforseo",
};

const suggestions = [
  { clicks: 40, impressions: 900, query: "keyword tracking api" },
  { clicks: 12, impressions: 800, query: "serp api" },
  { clicks: 5, impressions: 200, query: "rank tracker" },
  { clicks: 2, impressions: 100, query: "seo dashboard" },
];

function renderDrawer(props: Partial<Parameters<typeof KeywordSuggestionDrawer>[0]> = {}) {
  const onConfirm = vi.fn();
  render(
    <KeywordSuggestionDrawer
      costContext={costContext}
      existingKeywords={["rank tracker"]}
      hidden={[]}
      onClose={vi.fn()}
      onConfirm={onConfirm}
      open
      suggestions={suggestions}
      {...props}
    />,
  );
  return { onConfirm };
}

describe("KeywordSuggestionDrawer", () => {
  it("preselects untracked suggestions and disables already-tracked rows", () => {
    renderDrawer();

    // rank tracker is already tracked: disabled with a badge, not counted.
    const trackedRow = screen.getByLabelText("rank tracker") as HTMLInputElement;
    expect(trackedRow).toBeDisabled();
    expect(screen.getByText("Tracked")).toBeInTheDocument();

    // The three untracked queries are preselected by default.
    expect(screen.getByRole("button", { name: "Add 3 keywords" })).toBeEnabled();
  });

  it("renders Select all and Clear contextually across empty, partial and full states", () => {
    renderDrawer();

    // Default preselects every untracked row (full): only Clear + Top 20.
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();

    // Empty: only Select all.
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();

    // Partial (e.g. after Top N): both are meaningful and both show.
    fireEvent.click(screen.getByLabelText("serp api"));
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("confirms the selected queries in source order", () => {
    const { onConfirm } = renderDrawer();

    // All untracked rows are preselected (full state), so Clear is shown.
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Add 0 keywords/ })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("serp api"));
    fireEvent.click(screen.getByLabelText("keyword tracking api"));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 keywords" }));

    expect(onConfirm).toHaveBeenCalledWith(["keyword tracking api", "serp api"]);
  });

  it("reveals hidden low-quality queries on request", () => {
    renderDrawer({ hidden: [{ query: "-site:reddit.com" }] });

    expect(screen.getByText(/1 low-quality query hidden/)).toBeInTheDocument();
    expect(screen.queryByLabelText("-site:reddit.com")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show anyway" }));
    expect(screen.getByLabelText("-site:reddit.com")).toBeInTheDocument();
  });

  it("shows the added-keyword cost delta wired to the shared cost model", () => {
    renderDrawer();

    // 3 keywords x daily x depth/devices/locations, override 200 cents/check.
    expect(screen.getByText(/\+3 keywords = \+/)).toBeInTheDocument();
  });
});
