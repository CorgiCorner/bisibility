import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectRunsContent } from "./ProjectRunsContent";
import { timelineFixtureRuns, timelineProjectRef } from "./project-runs-timeline.fixtures";

beforeEach(() => vi.clearAllMocks());
vi.mock("@/lib/ui/use-media-query", () => ({ useMediaQuery: () => true }));

function renderTimeline() {
  return render(
    <ProjectRunsContent
      canMutate={false}
      operations={[]}
      page={{
        counts: { rankChecks: 8, searchConsole: 0, total: 8 },
        nextCursor: "next-page",
        runs: timelineFixtureRuns,
      }}
      projectRef={timelineProjectRef}
      query={{ ...PROJECT_RUNS_DEFAULT_QUERY, cursor: "old-page" }}
      runNowAction={vi.fn()}
      skipAction={vi.fn()}
    />,
  );
}

describe("run timeline", () => {
  it("shows three sections with explicit dates and an empty-run reason", () => {
    renderTimeline();
    const table = screen.getByRole("table", { name: "Project runs" });
    expect(within(table).getByText("In progress")).toBeVisible();
    expect(within(table).getByText("Upcoming")).toBeVisible();
    expect(within(table).getByText("History")).toBeVisible();
    expect(within(table).getByText(/Workers can run in parallel./)).toBeVisible();
    expect(within(table).getByText("Retry from")).toBeVisible();
    expect(within(table).getAllByText("Planned for")).toHaveLength(2);
    expect(within(table).getAllByText("Finished")).toHaveLength(4);
    expect(within(table).getByText("Skipped")).toBeVisible();
    expect(
      within(table)
        .getAllByText("No active keywords")
        .some((node) => node.classList.contains("text-fg-muted")),
    ).toBe(true);
  });

  it("uses server-side date sorting and resets pagination", () => {
    renderTimeline();
    fireEvent.click(screen.getByRole("button", { name: /When/ }));
    expect(routerMock.push).toHaveBeenCalledWith(`/app/${timelineProjectRef}/runs?order=desc`);
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute(
      "href",
      `/app/${timelineProjectRef}/runs?section=upcoming`,
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      `/app/${timelineProjectRef}/runs?cursor=next-page`,
    );
  });

  it("keeps viewer mutation actions unavailable in the chronological list", () => {
    renderTimeline();
    fireEvent.click(screen.getAllByRole("button", { name: "Actions for Scheduled rank check" })[1]);
    expect(screen.getByRole("menuitem", { name: "View details" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Run now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Skip once" })).not.toBeInTheDocument();
  });
});
