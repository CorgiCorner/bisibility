import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewCoverageSummary } from "./OverviewCoverageSummary";
import { ProjectDashboardMessages } from "./ProjectDashboardMessages";
import { measuredOverviewReport, unmeasuredOverviewReport } from "./quality-test-fixture";

function show(expected = 0, emptyProject = true, measured = false) {
  const report = measured ? measuredOverviewReport([3, 8]) : unmeasuredOverviewReport(expected);
  return render(
    <ProjectDashboardMessages>
      <OverviewCoverageSummary report={report} emptyProject={emptyProject} />
    </ProjectDashboardMessages>,
  );
}

describe("dashboard coverage summary", () => {
  it("gives an empty project a next step without technical counters or a snapshot date", () => {
    const { container } = show();
    expect(screen.getByText("Add keywords to see your rankings here.")).toBeVisible();
    expect(container.querySelector("[data-coverage-message] > p")?.textContent).not.toMatch(
      /resolved|comparable pairs|freshness/i,
    );
    expect(container.querySelector("time")).toBeNull();
  });
  it("distinguishes an empty selection from an empty project", () => {
    show(0, false);
    expect(screen.getByText("No keywords match this view.")).toBeVisible();
  });
  it("does not claim a zero ranking or fresh data while waiting for usable evidence", () => {
    show(3, false);
    expect(
      screen.getByText("Your ranking summary will appear when data is available."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Explain: Data quality and coverage" }));
    const label = screen.getByText("Expected targets");
    expect(label.nextElementSibling).toHaveTextContent("3");
  });
  it("shows available results and their snapshot date", () => {
    const { container } = show(2, false, true);
    expect(screen.getByText("Results available for 2 of 2 keywords.")).toBeVisible();
    expect(container.querySelector("time")).not.toBeNull();
  });
});
