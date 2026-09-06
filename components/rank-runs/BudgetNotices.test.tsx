import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BudgetNotice, BudgetNotices } from "./BudgetNotices";

const checkRunsHref = "https://example.com/runs";
const budgetSettingsHref = "https://example.com/settings/usage?budget=edit";

function renderNotices(
  notices: readonly BudgetNotice[],
  layout?: "keyword-flush" | "keyword-stack" | "runs",
) {
  return render(<BudgetNotices layout={layout} notices={notices} />);
}

describe("BudgetNotices", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the checks-running acceptance state", () => {
    renderNotices(
      [{ checkRunsHref, kind: "checks-running", runId: "rcr_running" }],
      "keyword-stack",
    );

    expect(screen.getByText("Rank targets are running.")).toBeInTheDocument();
    expect(
      screen.getByText("Ranking data will appear after the running targets finish."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View runs" })).toHaveAttribute("href", checkRunsHref);
  });

  it("renders the check-failures acceptance state", () => {
    const retry = vi.fn();
    renderNotices(
      [
        {
          detail: "headless cms: The provider rejected the request - monthly quota exceeded.",
          failedCount: 3,
          kind: "check-failures",
          onRetry: retry,
          runId: "rcr_failed",
        },
      ],
      "keyword-flush",
    );

    expect(screen.getByText("3 targets failed in the last 24 hours.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry failed targets" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders the budget-exhausted acceptance state", () => {
    renderNotices(
      [
        {
          budgetSettingsHref,
          capPeriod: "2026-09",
          kind: "budget-exhausted",
        },
      ],
      "keyword-flush",
    );

    expect(
      screen.getByText("Targets are paused because the budget was reached."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit budget" })).toHaveAttribute(
      "href",
      budgetSettingsHref,
    );
  });

  it("renders the runs budget state without money", () => {
    renderNotices([
      {
        budgetSettingsHref,
        capPeriod: "2026-09",
        kind: "budget-exhausted",
      },
    ]);

    expect(
      screen.getByText("Targets are paused because the budget was reached."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit budget" })).toHaveAttribute(
      "href",
      budgetSettingsHref,
    );
  });

  it("hides a dismissed block and renders the next run as a new block", async () => {
    const { rerender } = renderNotices(
      [{ checkRunsHref, kind: "checks-running", runId: "rcr_running" }],
      "keyword-stack",
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    await waitFor(() =>
      expect(screen.queryByText("Rank targets are running.")).not.toBeInTheDocument(),
    );

    rerender(
      <BudgetNotices
        layout="keyword-stack"
        notices={[{ checkRunsHref, kind: "checks-running", runId: "rcr_new" }]}
      />,
    );
    expect(screen.getByText("Rank targets are running.")).toBeInTheDocument();
  });
});
