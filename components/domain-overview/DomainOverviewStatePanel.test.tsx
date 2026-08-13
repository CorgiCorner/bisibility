import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainOverviewStatePanel } from "./DomainOverviewStatePanel";
import type { DomainOverviewUiState } from "./domain-overview-workspace-model";

const expected: Array<[DomainOverviewUiState, RegExp]> = [
  ["idle", /analyze any domain/i],
  ["in_progress", /analysis already in progress/i],
  ["loading", /domain overview loading/i],
  ["no_data", /no index data/i],
  ["empty", /nothing matches/i],
  ["partial", /part of this report/i],
  ["rate_limited", /provider rate limit reached/i],
  ["cost_limit_exceeded", /approved price is no longer current/i],
  ["snapshot_expired", /cached analysis has expired/i],
  ["no_provider", /connect dataforseo to analyze domains/i],
  ["needs_reauth", /needs to be reconnected/i],
  ["budget_exhausted", /monthly provider budget reached/i],
  ["lookup_failed", /lookup did not go through/i],
  ["unsupported_location", /market is not supported/i],
];

describe("DomainOverviewStatePanel", () => {
  it.each(expected)("renders the %s state", (state, label) => {
    render(<DomainOverviewStatePanel projectRef="prj_1" state={state} />);
    const query = state === "loading" ? screen.getByLabelText(label) : screen.getByText(label);
    expect(query).toBeInTheDocument();
  });

  it("only makes a no-charge promise for an explicitly uncharged failure", () => {
    const { rerender } = render(
      <DomainOverviewStatePanel charged={false} projectRef="prj_1" state="lookup_failed" />,
    );
    expect(screen.getByText(/not charged/i)).toBeInTheDocument();
    rerender(<DomainOverviewStatePanel charged projectRef="prj_1" state="lookup_failed" />);
    expect(screen.queryByText(/not charged/i)).not.toBeInTheDocument();
    expect(screen.getByText(/reported a charge/i)).toBeInTheDocument();
    rerender(<DomainOverviewStatePanel charged={null} projectRef="prj_1" state="lookup_failed" />);
    expect(screen.queryByText(/not charged/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reported a charge/i)).not.toBeInTheDocument();
  });

  it("shows the reset time for contention without offering an immediate retry", () => {
    render(
      <DomainOverviewStatePanel
        onRetry={() => {}}
        projectRef="prj_1"
        resetAt={Date.parse("2026-08-12T12:34:00.000Z")}
        state="in_progress"
      />,
    );
    expect(screen.getByText(/try again after/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
