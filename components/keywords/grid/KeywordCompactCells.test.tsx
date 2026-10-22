import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordRankValue } from "./KeywordRankValue";
import { KeywordRecordedCheckCell } from "./KeywordRecordedCheckCell";
import { currentScopeUnavailableRow, rankQualityRow } from "./keyword-rank-quality.test-fixture";
import { TargetRankingCell } from "./TargetRankingCell";

describe("compact Rank Tracker cells", () => {
  it("keeps an unknown current position separate from a short retained position", () => {
    render(<KeywordRankValue compact row={currentScopeUnavailableRow()} />);
    const current = screen.getByRole("button", { name: "Current position unknown" });
    expect(current).toHaveTextContent("-");
    expect(screen.queryByText("Current position unknown")).not.toBeInTheDocument();
    const retained = screen.getByText("Last known #6");
    expect(retained).toBeVisible();
    expect(retained).toHaveAccessibleDescription(/Last known #6 · observed/);
    expect(current).toHaveAccessibleDescription("Current tracking settings unavailable");
    expect(screen.queryByText("#101")).not.toBeInTheDocument();
  });
  it("explains unknown freshness in one factual sentence", () => {
    render(<KeywordRankValue compact row={rankQualityRow()} />);
    expect(screen.getByText("#6")).toHaveAccessibleDescription(
      "We can’t confirm how current this result is.",
    );
    expect(screen.queryByText("Freshness unknown")).not.toBeInTheDocument();
  });
  it("shows one recorded date and preserves the distinct observed date in its description", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_fixture" writeMode="active">
        <KeywordRecordedCheckCell compact row={rankQualityRow()} />
      </ProjectWriteModeProvider>,
    );
    const times = document.querySelectorAll("time");
    expect(times).toHaveLength(1);
    expect(times[0].dateTime).toBe("2026-10-10T09:59:00.000Z");
    expect(times[0].closest("button")).toHaveAccessibleDescription(/Recorded.*Observed/s);
    expect(times[0].textContent).not.toContain("Recorded");
    expect(times[0].textContent).not.toContain("Observed");
  });
  it("keeps captured expectations and retained URLs discoverable without diagnostic rows", () => {
    const row = currentScopeUnavailableRow();
    row.expectedUrl = "/target";
    render(<TargetRankingCell compact row={row} />);
    const target = screen.getByText("/target");
    expect(target).toHaveAccessibleDescription(/Expected URL captured with this measurement/);
    const ranking = screen.getByRole("link", { name: "/retained" });
    expect(ranking).toHaveAccessibleDescription(/Last known URL. Current result unavailable/);
    expect(screen.getByText("Last known")).toBeVisible();
    expect(screen.queryByText("Matches")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Expected URL captured with this measurement"),
    ).not.toBeInTheDocument();
  });
});
