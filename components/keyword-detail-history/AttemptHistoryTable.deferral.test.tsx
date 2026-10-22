import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttemptHistoryTable } from "./AttemptHistoryTable";
import { attempt, historyPages } from "./history.test-fixture";

describe("attempt history deferral labels", () => {
  it("translates a stored code and a legacy sentence to the short label", () => {
    const page = historyPages(0).attempts;
    render(
      <AttemptHistoryTable
        page={{
          ...page,
          records: [
            attempt(0, { deferredReason: "quote_unavailable", status: "deferred" }),
            attempt(1, {
              deferredReason: "Provider request has no confirmed monetary estimate",
              status: "deferred",
            }),
          ],
          totalCount: 2,
        }}
        timeZone="UTC"
      />,
    );

    const labels = screen.getAllByText("Price unavailable");
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label).toHaveClass("text-fg-muted");
    expect(screen.queryByText("quote_unavailable")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Provider request has no confirmed monetary estimate"),
    ).not.toBeInTheDocument();
  });
});
