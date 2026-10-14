import { overviewContributors } from "@/lib/queries/overview-contributors";
import { buildOverviewReportHistory } from "@/lib/queries/overview-report-history";
import type { Keyword } from "@/lib/queries/overview-trend";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewContributorsCard } from "./OverviewContributorsCard";
import { OverviewReportHistoryCard } from "./OverviewReportHistoryCard";
import { ProjectDashboardMessages } from "./ProjectDashboardMessages";

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  TimeSeriesChart: () => <div data-testid="history-chart" />,
}));

function fixture() {
  const keywords: Keyword[] = Array.from({ length: 30 }, (_, index) => ({
    id: `internal-${index}`,
    publicId: `kw_${String(index).padStart(2, "0")}`,
    projectId: "project-a",
    text: `Synthetic keyword ${index}`,
    createdAt: new Date("2026-01-01"),
    device: "desktop",
    schedule: null,
    _count: { rankChecks: 1 },
    locationRef: { displayName: "City A", languageCode: "en", languageLabel: "English" },
    rankChecks: [recordedFixture(1, { id: `check-${index}` })],
  }));
  const history = buildOverviewReportHistory(keywords, new Map(), {
    asOf: new Date("2026-10-12T12:00:00Z"),
    range: "7d",
    timeZone: "Europe/Warsaw",
  });
  const report = history.days.at(-1)!.report;
  return { history, report, rows: overviewContributors(keywords, report) };
}

describe("installed dashboard report widgets", () => {
  it("keeps historical metric help tied to each stored version instead of assigning the latest definition", () => {
    const { history } = fixture();
    const first = history.days[0]!;
    const last = history.days.at(-1)!;
    render(
      <ProjectDashboardMessages>
        <OverviewReportHistoryCard
          history={{
            ...history,
            days: [
              first,
              { ...last, report: { ...last.report, definitionVersion: "future-history-version" } },
            ],
          }}
        />
      </ProjectDashboardMessages>,
    );
    const triggers = screen.getAllByRole("button", { name: "Explain: Organic visibility" });
    expect(triggers).toHaveLength(2);
    fireEvent.click(triggers[1]!);
    expect(screen.getByRole("dialog")).toHaveTextContent(
      sharedMessages.shared.measurementHelp.unknownVersion,
    );
    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      "A versioned index of organic results in the first 20 positions.",
    );
  });

  it("opens data-quality help with the retained history report's actual counts", () => {
    const { history } = fixture();
    render(
      <ProjectDashboardMessages>
        <OverviewReportHistoryCard history={history} quality />
      </ProjectDashboardMessages>,
    );
    expect(
      screen
        .getByRole("heading", { name: "Data quality history" })
        .closest("[data-overview-chart-header]"),
    ).toHaveTextContent(history.days.at(-1)!.id);
    fireEvent.click(screen.getByRole("button", { name: "Explain: Data quality and coverage" }));
    const dialog = screen.getByRole("dialog");
    const label = within(dialog).getByText("Expected targets");
    expect(label.nextElementSibling).toHaveTextContent(
      String(history.days.at(-1)!.report.counts.expected),
    );
  });

  it("explains contribution weights from the same report without changing the total", () => {
    const { report, rows } = fixture();
    render(
      <ProjectDashboardMessages>
        <OverviewContributorsCard rows={rows} report={report} projectRef="prj_test" />
      </ProjectDashboardMessages>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
    const expected = within(screen.getByRole("dialog")).getByText("Expected targets");
    expect(expected.nextElementSibling).toHaveTextContent(String(report.counts.expected));
    expect(
      screen.getByText("Total contribution: 100 pp. Comparable change: Unknown pp."),
    ).toBeVisible();
  });

  it("pages every contributor without changing the whole-scope sum or opening an internal ID", () => {
    const { rows, report } = fixture();
    render(
      <ProjectDashboardMessages>
        <OverviewContributorsCard rows={rows} report={report} projectRef="prj_test" />
      </ProjectDashboardMessages>,
    );
    expect(
      screen.getByText("Total contribution: 100 pp. Comparable change: Unknown pp."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Synthetic keyword 0" })).toHaveAttribute(
      "href",
      "/app/prj_test/rank-tracker/kw_00",
    );
    expect(screen.queryByRole("link", { name: "Synthetic keyword 29" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("link", { name: "Synthetic keyword 29" })).toHaveAttribute(
      "href",
      "/app/prj_test/rank-tracker/kw_29",
    );
    expect(
      screen.getByText("Total contribution: 100 pp. Comparable change: Unknown pp."),
    ).toBeVisible();
  });
  it("keeps calendar dates, selected-population explanation and a table alternative to the chart", () => {
    const { history } = fixture();
    render(
      <ProjectDashboardMessages>
        <OverviewReportHistoryCard history={history} />
      </ProjectDashboardMessages>,
    );
    expect(screen.getByRole("table", { name: "Visibility history" })).toBeVisible();
    expect(
      within(screen.getByRole("table", { name: "Visibility history" })).getByText("2026-10-12"),
    ).toBeVisible();
    expect(screen.getByText(/Retained observations for the targets selected at/)).toBeVisible();
    expect(screen.getByText(/Historical freshness policy is unknown/)).toBeVisible();
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
  });
  it("explains a missing report time zone without displaying a fabricated calendar", () => {
    const { history } = fixture();
    render(
      <ProjectDashboardMessages>
        <OverviewReportHistoryCard
          history={{ ...history, days: [], timeZone: null, reason: "time_zone_unavailable" }}
          quality
        />
      </ProjectDashboardMessages>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Configure the report time zone");
    expect(screen.queryByTestId("history-chart")).not.toBeInTheDocument();
  });
});
