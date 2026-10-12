import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { budgetFixture, headerFixture } from "@/lib/metering/shared-view-fixtures";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BudgetNotice, BudgetNotices } from "./BudgetNotices";
import { RankTrackerRunsTab } from "./RankTrackerRunsTab";

const mocks = vi.hoisted(() => ({
  getKeywordCount: vi.fn(),
  getRankCheckRunCount: vi.fn(),
  listRankCheckRuns: vi.fn(),
  loadWorkspaceBudgetSummary: vi.fn(),
  savedKeywordCount: vi.fn(),
}));

let capturedRunsProps: Record<string, unknown> = {};
let capturedTabsProps: Record<string, unknown> = {};

vi.mock("@/components/rank-tracker/RankTrackerTabs", () => ({
  RankTrackerTabs: (props: Record<string, unknown>) => {
    capturedTabsProps = props;
    return <div data-testid="rank-tracker-tabs" />;
  },
}));
vi.mock("@/components/rank-tracker/RankTrackerFeatureBoundary", () => ({
  RankTrackerFeatureBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./RunsSection", () => ({
  RunsSection: (props: Record<string, unknown>) => {
    capturedRunsProps = props;
    return (
      <div data-testid="runs-section">
        <BudgetNotices notices={props.notices as readonly BudgetNotice[]} />
      </div>
    );
  },
}));
vi.mock("@/lib/queries/keywords", () => ({ getKeywordCount: mocks.getKeywordCount }));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRunCount: mocks.getRankCheckRunCount,
  listRankCheckRuns: mocks.listRankCheckRuns,
}));
vi.mock("@/lib/queries/saved-keywords", () => ({
  savedKeywordCount: mocks.savedKeywordCount,
}));
vi.mock("@/lib/queries/workspace-budget-summary", () => ({
  loadWorkspaceBudgetSummary: mocks.loadWorkspaceBudgetSummary,
}));

describe("RankTrackerRunsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRunsProps = {};
    capturedTabsProps = {};
  });

  it("counts only History when planned runs exist", async () => {
    mocks.listRankCheckRuns.mockImplementation((_projectId: string, url: URL) =>
      Promise.resolve({
        data: url.searchParams.get("segment") === "planned" ? [{}, {}, {}] : [],
        nextCursor: null,
      }),
    );
    mocks.getKeywordCount.mockResolvedValue(0);
    mocks.getRankCheckRunCount.mockResolvedValue(0);
    mocks.savedKeywordCount.mockResolvedValue(0);
    mocks.loadWorkspaceBudgetSummary.mockResolvedValue(headerFixture([]));

    render(await RankTrackerRunsTab({ projectId: "project_1", projectRef: "prj_1" }));

    expect(capturedTabsProps.runsCount).toBe(0);
  });

  it("uses the total run count rather than the paged History length", async () => {
    mocks.listRankCheckRuns.mockResolvedValue({
      data: Array.from({ length: 20 }),
      nextCursor: "next",
    });
    mocks.getKeywordCount.mockResolvedValue(0);
    mocks.getRankCheckRunCount.mockResolvedValue(25);
    mocks.savedKeywordCount.mockResolvedValue(0);
    mocks.loadWorkspaceBudgetSummary.mockResolvedValue(headerFixture([]));

    render(await RankTrackerRunsTab({ projectId: "project_1", projectRef: "prj_1" }));

    expect(capturedTabsProps.runsCount).toBe(25);
  });

  it("loads both run segments and derives the budget state from the allocation summary", async () => {
    mocks.listRankCheckRuns.mockImplementation((_projectId: string, url: URL) =>
      Promise.resolve({ data: [{ segment: url.searchParams.get("segment") }], nextCursor: null }),
    );
    mocks.getKeywordCount.mockResolvedValue(9);
    mocks.getRankCheckRunCount.mockResolvedValue(1);
    mocks.savedKeywordCount.mockResolvedValue(2);
    mocks.loadWorkspaceBudgetSummary.mockResolvedValue(
      headerFixture([{ ...budgetFixture("100"), level: "exceeded" }]),
    );

    render(await RankTrackerRunsTab({ projectId: "project_1", projectRef: "prj_1" }));

    expect(screen.getByTestId("runs-section")).toBeInTheDocument();
    expect(mocks.listRankCheckRuns).toHaveBeenCalledTimes(2);
    const segments = mocks.listRankCheckRuns.mock.calls.map(([, url]) =>
      (url as URL).searchParams.get("segment"),
    );
    expect(segments).toEqual(["history", "planned"]);
    expect(mocks.loadWorkspaceBudgetSummary).toHaveBeenCalledWith("prj_1");
    expect(capturedRunsProps).toMatchObject({
      budgetExhausted: true,
      budgetSettingsHref: "/app/prj_1/integrations?tab=usage&budget=edit",
      notices: [expect.objectContaining({ kind: "budget-exhausted" })],
      projectRef: "prj_1",
    });
  });

  it("does not expose a budget state or notice when no allocation exists", async () => {
    mocks.listRankCheckRuns.mockResolvedValue({ data: [], nextCursor: null });
    mocks.getKeywordCount.mockResolvedValue(0);
    mocks.getRankCheckRunCount.mockResolvedValue(0);
    mocks.savedKeywordCount.mockResolvedValue(0);
    mocks.loadWorkspaceBudgetSummary.mockResolvedValue(headerFixture([]));

    render(await RankTrackerRunsTab({ projectId: "project_1", projectRef: "prj_1" }));

    expect(capturedRunsProps).toMatchObject({ budgetExhausted: false, notices: [] });
  });
});

it("passes an amount-free blocking notice for a restricted member", async () => {
  mocks.listRankCheckRuns.mockResolvedValue({ data: [], nextCursor: null });
  mocks.getKeywordCount.mockResolvedValue(0);
  mocks.getRankCheckRunCount.mockResolvedValue(0);
  mocks.savedKeywordCount.mockResolvedValue(0);
  mocks.loadWorkspaceBudgetSummary.mockResolvedValue({
    ...headerFixture([]),
    paidWorkBlocked: true,
    budgets: { state: "forbidden", rows: [], problem: null },
  });
  render(await RankTrackerRunsTab({ projectId: "project_1", projectRef: "prj_1" }));
  expect(capturedRunsProps).toMatchObject({
    budgetExhausted: true,
    notices: [expect.objectContaining({ kind: "budget-exhausted" })],
  });
  expect(capturedRunsProps.notices).toEqual([
    {
      kind: "budget-exhausted",
      capPeriod: expect.any(String),
      budgetSettingsHref: "/app/prj_1/integrations?tab=usage&budget=edit",
    },
  ]);
  expect(capturedRunsProps).not.toHaveProperty("budgets");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Targets are paused because the budget was reached.",
  );
});
