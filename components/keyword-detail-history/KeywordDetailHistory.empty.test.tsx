import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fixtureHistoryPort, historyPages } from "./history.test-fixture";
import { KeywordDetailHistory } from "./KeywordDetailHistory";
import { RecordedHistoryChart } from "./RecordedHistoryChart";

describe("empty recorded history", () => {
  it("explains the empty chart using the compact shared empty state", () => {
    const { container } = render(
      <RecordedHistoryChart
        page={historyPages(0).observations}
        onOpen={() => undefined}
        timeZone="UTC"
      />,
    );
    const title = screen.getByRole("heading", { name: "No positions to display" });
    expect(title.closest("[data-empty-state]")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByText(/0 of 0 observations/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dates use the chosen time basis/)).not.toBeInTheDocument();
    expect(screen.getByText("No confirmed positions are available for this period.")).toBeVisible();
  });

  it("keeps empty observations and attempts readable, with a table divider", () => {
    render(
      <KeywordDetailHistory
        history={fixtureHistoryPort(historyPages(0))}
        keyword="Stored target"
        timeZone="UTC"
      />,
    );
    const observations = screen.getByRole("table", { name: "Recorded observations" });
    expect(
      within(observations).getByRole("heading", { name: "No observations in this period" }),
    ).toBeVisible();
    expect(within(observations).getAllByRole("row")[0]).not.toHaveClass("border-b-0");
    fireEvent.click(screen.getByRole("radio", { name: "Attempts" }));
    const attempts = screen.getByRole("table", { name: "Recorded logical attempts" });
    expect(
      within(attempts).getByRole("heading", { name: "No check attempts in this period" }),
    ).toBeVisible();
    expect(within(attempts).getAllByRole("row")[0]).not.toHaveClass("border-b-0");
  });
});
