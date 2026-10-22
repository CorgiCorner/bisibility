import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { PROJECT_RUNS_DEFAULT_QUERY, parseProjectRunsQuery } from "@/lib/runs/filters";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectRunsContent } from "./ProjectRunsContent";
import { ProjectRunsTimelineTabs } from "./ProjectRunsTimelineTabs";
import {
  attentionFixtureRuns,
  timelineFixtureRuns,
  timelineProjectRef,
} from "./project-runs-timeline.fixtures";
import { RunTimelineSection } from "./RunTimelineSection";

const viewport = vi.hoisted(() => ({ desktop: true }));
vi.mock("@/lib/ui/use-media-query", () => ({ useMediaQuery: () => viewport.desktop }));
const blocked = timelineFixtureRuns[3];
const planned = timelineFixtureRuns[2];
const failed = timelineFixtureRuns[5];
const rows = [
  {
    ...blocked,
    details: { ...blocked.details, blockedReason: "budget_exhausted" },
    timestamps: { ...blocked.timestamps, plannedFor: "2026-10-14T00:00:00.000Z" },
  },
  { ...planned, timestamps: { ...planned.timestamps, plannedFor: "2026-10-21T00:00:00.000Z" } },
  failed,
];
beforeEach(() => {
  vi.clearAllMocks();
  viewport.desktop = true;
});
function preview(status: "all" | "attention" = "all") {
  return render(
    <ProjectRunsContent
      canMutate={false}
      operations={[]}
      page={{
        counts: {
          aiTracking: 0,
          rankChecks: status === "attention" ? 4 : 61,
          searchConsole: 0,
          total: status === "attention" ? 4 : 61,
        },
        nextCursor: null,
        runs: status === "attention" ? attentionFixtureRuns.filter((run) => run.attention) : rows,
      }}
      projectRef={timelineProjectRef}
      query={{ ...PROJECT_RUNS_DEFAULT_QUERY, status, cursor: "old" }}
      readAt="2026-10-18T12:00:00.000Z"
      runNowAction={vi.fn()}
      skipAction={vi.fn()}
    />,
  );
}
it.each([true, false])(
  "shows Oct 14 as unstarted past its date and Oct 21 separately (desktop=%s)",
  (desktop) => {
    viewport.desktop = desktop;
    preview();
    const table = screen.getByRole("table", { name: "Project runs" });
    expect(within(table).getByText("Start time passed")).toBeVisible();
    expect(within(table).getByText("Scheduled later")).toBeVisible();
    expect(within(table).getByText(/4 days past scheduled time/)).toBeVisible();
    expect(within(table).getByText("Review budget and usage")).toBeVisible();
    expect(
      within(table).getByText("Review budget and usage").closest('[role="row"]'),
    ).not.toHaveTextContent("$0.00");
    expect(table).not.toHaveTextContent("resets");
    expect(screen.getByRole("heading", { name: "61 runs" })).toBeVisible();
  },
);
it("keeps current blocked work separate from terminal failures and resets the attention cursor", () => {
  preview("attention");
  expect(
    screen.getByText("Past runs that ended with a problem. These are not current waiting runs."),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "4 runs" })).toBeVisible();
  const table = screen.getByRole("table", { name: "Project runs" });
  expect(within(table).getAllByText("Failed")).toHaveLength(3);
  expect(within(table).getAllByText("Blocked")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Run status" })).toHaveTextContent("Needs attention");
  const review = screen.getByRole("link", { name: "Review issue" });
  fireEvent.click(review);
  expect(routerMock.push).not.toHaveBeenCalled();
  expect(review).toHaveAttribute("href", attentionFixtureRuns[0].href);
});

it("shows the retained waiting section while attention is active", () => {
  render(
    <ProjectRunsContent
      canMutate={false}
      operations={[]}
      page={{
        counts: { aiTracking: 0, rankChecks: 1, searchConsole: 0, total: 1 },
        nextCursor: null,
        runs: [rows[0]],
      }}
      projectRef={timelineProjectRef}
      query={{
        ...PROJECT_RUNS_DEFAULT_QUERY,
        section: "upcoming",
        status: "attention",
        cursor: null,
      }}
      readAt="2026-10-18T12:00:00.000Z"
      runNowAction={vi.fn()}
      skipAction={vi.fn()}
    />,
  );
  expect(screen.getByRole("radio", { name: "Waiting to start" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(screen.getByRole("button", { name: "Run status" })).toHaveTextContent("Needs attention");
});

it("retains the past-failure explanation when attention history is explicitly sorted", () => {
  render(
    <RunTimelineSection run={failed} order="desc" attention readAt="2026-10-18T12:00:00.000Z" />,
  );
  expect(
    screen.getByText("Past runs that ended with a problem. These are not current waiting runs."),
  ).toBeVisible();
  expect(screen.queryByText("Newest first")).not.toBeInTheDocument();
});

it.each([
  ["", "All", false],
  ["section=history", "History", false],
  ["section=active", "In progress", false],
  ["section=upcoming", "Waiting to start", false],
  ["view=planned", "Waiting to start", false],
  ["status=attention", "All", true],
  ["section=history&status=attention", "History", true],
  ["section=active&status=attention", "In progress", true],
  ["section=upcoming&status=attention", "Waiting to start", true],
  ["view=planned&status=attention", "Waiting to start", true],
  [
    "status=attention&source=rank_checks&section=history&order=asc&limit=50&cursor=older",
    "History",
    true,
  ],
  ["section=history&status=failed&source=search_console", "History", false],
])("derives one section and the independent attention state from URL %s", (search, label) => {
  render(
    <ProjectRunsTimelineTabs
      projectRef={timelineProjectRef}
      query={parseProjectRunsQuery(new URLSearchParams(search))}
    />,
  );
  const group = screen.getByRole("radiogroup", { name: "Run timeline" });
  expect(within(group).getAllByRole("radio", { checked: true })).toHaveLength(1);
  expect(within(group).getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByRole("button", { name: "Needs attention" })).not.toBeInTheDocument();
});

it("restores selection from route changes and refreshes", () => {
  const view = (search: string) => (
    <ProjectRunsTimelineTabs
      projectRef={timelineProjectRef}
      query={parseProjectRunsQuery(new URLSearchParams(search))}
    />
  );
  const { rerender } = render(view("section=history&source=rank_checks&cursor=older"));
  for (const search of [
    "section=history&status=attention",
    "section=history&status=attention",
    "section=history",
    "section=history&status=attention",
  ]) {
    rerender(view(search));
    expect(screen.getByRole("radio", { name: "History" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "Needs attention" })).not.toBeInTheDocument();
  }
});
