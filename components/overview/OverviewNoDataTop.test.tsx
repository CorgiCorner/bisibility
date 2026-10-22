import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewNoData } from "./OverviewNoData";
import { RecentlyAddedCard } from "./OverviewNoDataBottom";
import { NoDataBanner, type NoDataBannerState, NoDataKpiRow } from "./OverviewNoDataTop";
import { overviewFixture } from "./overview-fixtures";
import type { OverviewView } from "./types";

const firstCheckPreflight = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/components/rank-runs/useRunPreflight", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/rank-runs/useRunPreflight")>()),
  useRunPreflight: () => ({ request: firstCheckPreflight.request, dialog: null, opening: false }),
}));

const KEYWORD_ID = "kw_abcdefghijklmnopqrstuvwx";

const readyPlan = {
  budget: { capCents: 5000, spentCents: 0 },
  budgetExhausted: false,
  estimatedCostPerCheckCents: 0.1,
  isSampleProject: false,
  providerReady: true,
  providers: ["dataforseo", "serpapi"],
  readyCount: 2,
  scope: {
    depth: 100,
    device: "desktop",
    engine: "google",
    frequency: "daily",
    location: "United States",
  },
};

function renderDashboard(children: ReactNode) {
  return render(<ProjectDashboardMessages>{children}</ProjectDashboardMessages>);
}

function renderBanner(
  state: NoDataBannerState,
  runCheckNowAction: (input: { keywordId: string }) => Promise<unknown> = vi.fn(),
  _queueFirstChecksAction: (input: {
    excludeKeywordIds?: string[];
    projectId: string;
  }) => Promise<unknown> = vi.fn().mockResolvedValue({ queued: 1 }),
  keywordCount = 2,
  keywordId: string | null = KEYWORD_ID,
  getFirstCheckRunPlanAction: ComponentProps<typeof NoDataBanner>["getFirstCheckRunPlanAction"] = vi
    .fn()
    .mockResolvedValue(readyPlan),
) {
  render(
    <ProjectDashboardMessages>
      <NoDataBanner
        getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
        keywordCount={keywordCount}
        keywordId={keywordId}
        projectId="prj_1"
        projectRef="prj_1"
        runCheckNowAction={runCheckNowAction}
        state={state}
      />
    </ProjectDashboardMessages>,
  );
}

describe("NoDataBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    firstCheckPreflight.request.mockReset();
  });
  it("offers SERP setup only when no SERP provider exists", () => {
    renderBanner("missing");

    expect(screen.getByRole("heading", { name: "Choose a data source" })).toBeInTheDocument();
    expect(screen.getByTestId("first-check-banner-icon")).toHaveAttribute(
      "data-icon",
      "puzzle-piece",
    );
    expect(screen.getByTestId("first-check-banner-icon")).toHaveAttribute("data-weight", "regular");
    expect(screen.getByRole("link", { name: "Choose a data source" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations#all-providers",
    );
    expect(screen.queryByText(/queued/i)).not.toBeInTheDocument();
  });

  it("omits keyword readiness when a SERP provider is missing", () => {
    renderBanner("missing", vi.fn(), vi.fn().mockResolvedValue({ queued: 1 }), 0);

    expect(
      screen.getByText("Choose a data source in Integrations to run checks."),
    ).toBeInTheDocument();
  });

  it("directs an existing broken provider to management", () => {
    renderBanner("needs_attention");

    expect(screen.getByText("SERP provider needs attention.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage provider" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations#all-providers",
    );
  });

  it("confirms through the quoted preflight before starting one first check when a SERP provider is ready", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({ status: "running" });
    renderBanner("ready", runCheckNowAction);

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));

    await waitFor(() =>
      expect(firstCheckPreflight.request).toHaveBeenCalledWith(
        expect.objectContaining({
          depth: 100,
          spec: { kind: "single", keywordId: KEYWORD_ID, v: 1 },
          title: "Run first check",
        }),
      ),
    );
    expect(runCheckNowAction).not.toHaveBeenCalled();
  });

  it("shows check runs instead of another start action while the first check runs", () => {
    renderBanner("running");

    expect(screen.getByText("First rank check in progress.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View check runs" })).toHaveAttribute(
      "href",
      "/app/prj_1/runs",
    );
    expect(screen.queryByRole("button", { name: "Run first check" })).not.toBeInTheDocument();
  });

  it("does not offer a first check without a keyword", () => {
    renderBanner("ready", vi.fn(), vi.fn(), 0, null);
    expect(screen.queryByRole("region", { name: "Run your first check" })).not.toBeInTheDocument();
    expect(screen.queryByText("No rankings yet")).not.toBeInTheDocument();
  });

  it("remembers dismissal across remounts without starting a check", () => {
    const runCheckNowAction = vi.fn();
    renderBanner("ready", runCheckNowAction);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this introduction" }));
    expect(screen.queryByRole("region", { name: "Run your first check" })).not.toBeInTheDocument();
    renderBanner("ready", runCheckNowAction);
    expect(screen.queryByRole("region", { name: "Run your first check" })).not.toBeInTheDocument();
    expect(runCheckNowAction).not.toHaveBeenCalled();
  });

  it("takes precedence over provider and running states during a migration hold", () => {
    renderBanner("migration_hold");

    expect(screen.getByText("Rank checks paused.")).toBeInTheDocument();
    expect(screen.getByText(/project is on migration hold/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View keywords" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker",
    );
    expect(screen.queryByRole("button", { name: "Run first check" })).not.toBeInTheDocument();
  });

  it("keeps stale Server Action details out of a failed first-check plan load", async () => {
    const runCheckNowAction = vi.fn();
    renderBanner(
      "ready",
      runCheckNowAction,
      undefined,
      2,
      KEYWORD_ID,
      vi.fn().mockRejectedValue(new Error('Server Action "deadbeef" was not found on the server.')),
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Run details could not be loaded.");
    expect(screen.queryByText(/deadbeef/)).not.toBeInTheDocument();
    expect(firstCheckPreflight.request).not.toHaveBeenCalled();
    expect(runCheckNowAction).not.toHaveBeenCalled();
  });
});

describe("NoDataKpiRow", () => {
  const states: Array<{
    budgetExhausted: boolean;
    expected: string;
    projectReadOnly: boolean;
    runningCheckCount: number;
    serpProviderState: "missing" | "needs_attention" | "ready";
  }> = [
    {
      budgetExhausted: true,
      expected: "paused - migration hold",
      projectReadOnly: true,
      runningCheckCount: 1,
      serpProviderState: "ready",
    },
    {
      budgetExhausted: true,
      expected: "monthly budget exhausted",
      projectReadOnly: false,
      runningCheckCount: 1,
      serpProviderState: "ready",
    },
    {
      budgetExhausted: false,
      expected: "source not configured",
      projectReadOnly: false,
      runningCheckCount: 1,
      serpProviderState: "missing",
    },
    {
      budgetExhausted: false,
      expected: "provider needs attention",
      projectReadOnly: false,
      runningCheckCount: 1,
      serpProviderState: "needs_attention",
    },
    {
      budgetExhausted: false,
      expected: "check in progress",
      projectReadOnly: false,
      runningCheckCount: 1,
      serpProviderState: "ready",
    },
    {
      budgetExhausted: false,
      expected: "ready to check",
      projectReadOnly: false,
      runningCheckCount: 0,
      serpProviderState: "ready",
    },
  ];

  it("keeps KPI metrics while omitting the awaiting-first-check label", () => {
    renderDashboard(
      <NoDataKpiRow
        budgetExhausted={false}
        keywordCount={2}
        projectReadOnly={false}
        runningCheckCount={0}
        serpProviderState="ready"
        visibilityCoverage={{ limited: false, measured: 0, total: 2 }}
      />,
    );

    expect(screen.getByText("Avg. position")).toBeInTheDocument();
    expect(screen.getByText("Visibility")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 keywords measured")).toBeInTheDocument();
    expect(screen.getAllByText("–")).toHaveLength(3);
    expect(screen.queryByText("awaiting first check")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Explain: Organic visibility" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "A versioned index of organic results in the first 20 positions.",
    );
    expect(screen.getByRole("dialog").querySelector("dl")).toBeNull();
  });

  it.each(states)(
    "shows $expected when that is the current check state",
    ({ expected, ...props }) => {
      renderDashboard(
        <NoDataKpiRow
          {...props}
          keywordCount={2}
          visibilityCoverage={{ limited: false, measured: 0, total: 2 }}
        />,
      );

      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );
});

describe("first-check intro eligibility", () => {
  beforeEach(() => window.localStorage.clear());
  const uncheckedOverview = {
    ...overviewFixture,
    firstCheckSourceReady: true,
    firstPendingKeywordId: "kw_first",
    hasEverChecked: false,
    state: "no-data",
  } satisfies OverviewView;

  it.each([
    {
      name: "ready provider",
      budgetExhausted: false,
      canRunChecks: true,
      overview: uncheckedOverview,
      visible: true,
    },
    {
      name: "exhausted budget",
      budgetExhausted: true,
      canRunChecks: true,
      overview: uncheckedOverview,
      visible: false,
    },
    {
      name: "viewer",
      budgetExhausted: false,
      canRunChecks: false,
      overview: uncheckedOverview,
      visible: false,
    },
    {
      name: "previous results",
      budgetExhausted: false,
      canRunChecks: true,
      overview: { ...uncheckedOverview, hasEverChecked: true },
      visible: false,
    },
    {
      name: "missing provider",
      budgetExhausted: false,
      canRunChecks: true,
      overview: { ...uncheckedOverview, serpProviderState: "missing" as const },
      visible: false,
    },
    {
      name: "source not usable",
      budgetExhausted: false,
      canRunChecks: true,
      overview: { ...uncheckedOverview, firstCheckSourceReady: false },
      visible: false,
    },
  ])("gates the intro for $name", ({ visible, name: _name, ...props }) => {
    renderDashboard(
      <OverviewNoData
        {...props}
        getFirstCheckRunPlanAction={vi.fn()}
        projectId="prj_intro"
        projectRef="prj_intro"
        runningCheckCount={0}
        runCheckNowAction={vi.fn()}
      />,
    );
    expect(Boolean(screen.queryByRole("region", { name: "Run your first check" }))).toBe(visible);
  });
});

describe("RecentlyAddedCard", () => {
  it("renders the note and position text supplied by the overview builder", () => {
    renderDashboard(
      <RecentlyAddedCard
        projectRef="prj_1"
        rows={[
          {
            id: "kw_old",
            keyword: "old keyword",
            note: {
              age: { kind: "days", value: 90 },
              checkState: "firstCheckPending",
              kind: "recentlyAdded",
              url: null,
            },
            position: null,
            positionState: "awaitingFirstCheck",
            positionTone: "muted",
          },
        ]}
      />,
    );

    expect(screen.getByText("Added 90d ago · first check pending")).toBeInTheDocument();
    expect(screen.getByText("Awaiting first check")).toBeInTheDocument();
    expect(screen.queryByText("Added today · first check pending")).not.toBeInTheDocument();
  });

  it("keeps the builder note when rendered through OverviewNoData", () => {
    const overview = {
      ...overviewFixture,
      firstPendingKeywordId: "kw_old",
      hasEverChecked: false,
      highlights: [
        {
          kind: "recentlyAdded",
          rows: [
            {
              id: "kw_old",
              keyword: "old keyword",
              note: {
                age: { kind: "days", value: 90 },
                checkState: "firstCheckPending",
                kind: "recentlyAdded",
                url: null,
              },
              position: null,
              positionState: "awaitingFirstCheck",
              positionTone: "muted",
            },
          ],
        },
      ],
      lastCheckAt: null,
      lastCheckEverAt: null,
      state: "no-data",
    } satisfies OverviewView;

    renderDashboard(
      <OverviewNoData
        budgetExhausted={false}
        getFirstCheckRunPlanAction={vi.fn().mockResolvedValue(readyPlan)}
        overview={overview}
        projectId="prj_1"
        projectRef="prj_1"
        runningCheckCount={0}
        runCheckNowAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Added 90d ago · first check pending")).toBeInTheDocument();
    expect(screen.queryByText("Added today · first check pending")).not.toBeInTheDocument();
  });
});
