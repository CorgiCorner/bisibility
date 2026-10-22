import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { presentReportSummary } from "@/lib/rank-reports/presentation";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { KeywordChangeCell } from "./KeywordChangeCell";
import { KeywordRankValue } from "./KeywordRankValue";
import { KeywordRecordedCheckCell } from "./KeywordRecordedCheckCell";
import { KeywordReportSummary } from "./KeywordReportSummary";
import {
  currentScopeUnavailableRow,
  rankPoint,
  rankQualityGroup,
  rankQualityRow,
  wholeScopeReport,
} from "./keyword-rank-quality.test-fixture";

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ProjectWriteModeProvider projectRef="prj_fixture" writeMode="active">
      {children}
    </ProjectWriteModeProvider>
  );
}

describe("rank quality UI", () => {
  it("keeps General readable with explicitly unknown current KPI and separately dated retained rank", () => {
    render(<KeywordRankValue row={currentScopeUnavailableRow()} />);
    expect(screen.getByText("Current position unknown")).toBeInTheDocument();
    expect(screen.getByText(/Last known #6/)).toBeInTheDocument();
    expect(screen.getByText("Current tracking settings unavailable")).toBeInTheDocument();
    expect(screen.queryByText("#101")).not.toBeInTheDocument();
  });

  it("does not treat an unknown freshness policy as fresh", () => {
    const row = rankQualityRow();
    render(<KeywordRankValue row={row} />);
    expect(screen.getByText("#6")).toBeInTheDocument();
    expect(screen.getByText("Freshness unknown")).toBeInTheDocument();
    expect(screen.queryByText("Fresh")).not.toBeInTheDocument();
  });

  it("discloses the complete group counts instead of the first child's healthy status", () => {
    render(<KeywordRankValue row={rankQualityGroup()} />);
    expect(screen.getByText("Best measured #6")).toBeInTheDocument();
    expect(screen.getByText("1 ranked / 2 targets; 1 unknown")).toBeInTheDocument();
  });

  it("labels entered and exited as events without manufacturing a numeric movement", () => {
    const row = rankQualityRow();
    row.rankQuality = {
      ...row.rankQuality,
      event: "entered",
      comparison: "comparable",
      movement: null,
      baseline: rankPoint({ evidence: "known_absent", position: null }),
    };
    render(<KeywordChangeCell row={row} />);
    expect(screen.getByLabelText("Entered")).toHaveTextContent("Entered");
    expect(screen.queryByText("95")).not.toBeInTheDocument();
  });

  it("shows actual recorded and observed timestamps independently", () => {
    render(<KeywordRecordedCheckCell row={rankQualityRow()} />, { wrapper: Wrapper });
    const times = document.querySelectorAll("time");
    expect([...times].map((time) => time.dateTime)).toEqual([
      "2026-10-10T09:59:00.000Z",
      "2026-10-10T10:00:00.000Z",
    ]);
    expect(screen.queryByText("Fresh")).not.toBeInTheDocument();
  });

  it("does not let a failed new attempt erase the retained success or assert successful current execution", () => {
    const row = currentScopeUnavailableRow();
    const attempt = row.rankQuality.latestAttempt;
    if (!attempt) throw new Error("Fixture requires an attempt");
    row.rankQuality.latestAttempt = { ...attempt, status: "failed" };
    render(
      <>
        <KeywordRankValue row={row} />
        <KeywordRecordedCheckCell row={row} />
      </>,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/Last known #6/)).toBeInTheDocument();
    expect(screen.getByText("Current position unknown")).toBeInTheDocument();
  });

  it("renders whole-scope counts from the report regardless of the currently displayed page", () => {
    render(<KeywordReportSummary report={presentReportSummary(wholeScopeReport())} expected={1} />);
    expect(screen.getByTestId("keyword-full-scope-report")).toHaveTextContent("10 targets");
    expect(screen.getByTestId("keyword-full-scope-report")).toHaveTextContent("4 ranked");
    expect(screen.getByText("No comparable baseline")).toBeInTheDocument();
    expect(screen.queryByText(/Current page/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explain: Organic visibility/ })).toBeInTheDocument();
  });

  it("hides old headline values while a new report is loading", () => {
    const report = presentReportSummary(wholeScopeReport());
    render(<KeywordReportSummary report={report} expected={10} pending />);
    const summary = screen.getByTestId("keyword-full-scope-report");
    expect(summary).toHaveAttribute("aria-busy", "true");
    expect(summary).not.toHaveTextContent("measured");
    expect(summary).not.toHaveTextContent("Freshness");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows direction counts from the whole report and omits them when comparison was not requested", () => {
    const report = wholeScopeReport();
    const { rerender } = render(
      <KeywordReportSummary report={presentReportSummary(report)} expected={1} />,
    );
    expect(screen.getByText("1 improved; 1 declined")).toBeInTheDocument();
    rerender(
      <KeywordReportSummary
        report={presentReportSummary({
          ...report,
          comparison: "not_requested",
          movementCounts: null,
        })}
        expected={1}
      />,
    );
    expect(screen.queryByText("1 improved; 1 declined")).not.toBeInTheDocument();
  });

  it("does not populate full-scope metrics from page rows when the server report is missing", () => {
    render(<KeywordReportSummary expected={120} />);
    expect(
      screen.getByText("120 matching targets; full-scope measurement unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("keyword-full-scope-report")).not.toBeInTheDocument();
  });

  it("keeps unavailable metric and comparison values unknown rather than zero", () => {
    const report = wholeScopeReport();
    report.metric.value = null;
    report.metric.dataCoverage = null;
    report.metric.observedCoverage = null;
    render(<KeywordReportSummary report={presentReportSummary(report)} expected={10} />);
    expect(screen.getByRole("status", { name: /Organic visibility: unknown/ })).toBeInTheDocument();
    expect(
      screen.getByText("Data coverage unknown; observed coverage unknown"),
    ).toBeInTheDocument();
    expect(screen.getByText("No comparable baseline")).toBeInTheDocument();
    expect(screen.queryByText("Metric change 0")).not.toBeInTheDocument();
  });

  it("does not borrow the first child's execution status for a group", () => {
    const group = rankQualityGroup();
    render(<KeywordRecordedCheckCell row={{ ...group, lastCheckStatus: "failed" }} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("0 failed / 2 targets")).toBeInTheDocument();
    expect(screen.getByText("Freshness unknown")).toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("retains a legacy failed execution without relabeling its stored date as observed", () => {
    render(
      <KeywordRecordedCheckCell
        row={{
          ...keywordRows[0],
          lastCheckStatus: "failed",
          lastCheckAt: "2026-10-10T10:00:00.000Z",
        }}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/Stored check date/)).toBeInTheDocument();
    expect(screen.getByText("Observation time unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/^Observed /)).not.toBeInTheDocument();
  });
});
