import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewNoData } from "./OverviewNoData";
import { RecentlyAddedCard } from "./OverviewNoDataBottom";
import { NoDataBanner, type NoDataBannerState, NoDataKpiRow } from "./OverviewNoDataTop";
import { overviewFixture } from "./overview-fixtures";
import type { OverviewView } from "./types";

const readyPlan = {
  budget: { capCents: 5000, spentCents: 0 },
  budgetExhausted: false,
  estimatedCostPerCheckCents: 0.1,
  isSampleProject: false,
  providerReady: true,
  providers: ["dataforseo", "serpapi"],
  readyCount: 2,
  scope: {
    depth: "Top 100",
    device: "Desktop",
    engine: "Google",
    frequency: "Daily",
    location: "United States",
  },
};

function renderBanner(
  state: NoDataBannerState,
  runCheckNowAction: (input: { keywordId: string }) => Promise<unknown> = vi.fn(),
  queueFirstChecksAction: (input: {
    excludeKeywordIds?: string[];
    projectId: string;
  }) => Promise<unknown> = vi.fn().mockResolvedValue({ queued: 1 }),
) {
  render(
    <NoDataBanner
      getFirstCheckRunPlanAction={vi.fn().mockResolvedValue(readyPlan)}
      keywordCount={2}
      keywordId="kw_pending"
      projectId="prj_1"
      projectRef="prj_1"
      queueFirstChecksAction={queueFirstChecksAction}
      runCheckNowAction={runCheckNowAction}
      state={state}
    />,
  );
}

describe("NoDataBanner", () => {
  it("offers SERP setup only when no SERP provider exists", () => {
    renderBanner("missing");

    expect(screen.getByText("SERP provider required.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect SERP provider" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations#all-providers",
    );
    expect(screen.queryByText(/queued/i)).not.toBeInTheDocument();
  });

  it("directs an existing broken provider to management", () => {
    renderBanner("needs_attention");

    expect(screen.getByText("SERP provider needs attention.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage provider" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations#all-providers",
    );
  });

  it("confirms before starting one first check when a SERP provider is ready", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({ status: "running" });
    renderBanner("ready", runCheckNowAction);

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));

    expect(runCheckNowAction).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Run first check" })).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "Confirm & run" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(runCheckNowAction).toHaveBeenCalledWith({ keywordId: "kw_pending" }),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("shows check runs instead of another start action while the first check runs", () => {
    renderBanner("running");

    expect(screen.getByText("First rank check in progress.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View check runs" })).toHaveAttribute(
      "href",
      "/app/prj_1/checks",
    );
    expect(screen.queryByRole("button", { name: "Run first check" })).not.toBeInTheDocument();
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

  it("turns stale Server Action details into recovery guidance", async () => {
    const runCheckNowAction = vi
      .fn()
      .mockRejectedValue(new Error('Server Action "deadbeef" was not found on the server.'));
    renderBanner("ready", runCheckNowAction);

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));
    await screen.findByRole("dialog", { name: "Run first check" });
    const confirmButton = screen.getByRole("button", { name: "Confirm & run" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "bisibility was updated while this page was open. Refresh the app to continue.",
    );
    expect(screen.queryByText(/deadbeef/)).not.toBeInTheDocument();
  });

  it("keeps a budget-blocked first-check run open and does not queue the project", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({
      code: "budget_exhausted",
      message: "Rank check monthly budget reached.",
      status: "not_started",
    });
    const queueFirstChecksAction = vi.fn().mockResolvedValue({ queued: 1 });
    renderBanner("ready", runCheckNowAction, queueFirstChecksAction);

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));
    const allReady = await screen.findByRole("radio", { name: "All ready (2)" });
    fireEvent.click(allReady);
    const confirmButton = screen.getByRole("button", { name: "Confirm & run" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Rank check monthly budget reached.",
    );
    expect(queueFirstChecksAction).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Run first check" })).toBeInTheDocument();
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
      expected: "paused · migration hold",
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
      expected: "provider not connected",
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

  it.each(states)(
    "shows $expected when that is the current check state",
    ({ expected, ...props }) => {
      render(<NoDataKpiRow {...props} keywordCount={2} />);

      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );
});

describe("RecentlyAddedCard", () => {
  it("renders the note and position text supplied by the overview builder", () => {
    render(
      <RecentlyAddedCard
        projectRef="prj_1"
        rows={[
          {
            id: "kw_old",
            keyword: "old keyword",
            note: "Added 3 months ago · first check pending",
            positionText: "Awaiting first check",
            positionTone: "muted",
          },
        ]}
      />,
    );

    expect(screen.getByText("Added 3 months ago · first check pending")).toBeInTheDocument();
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
              note: "Added 3 months ago · first check pending",
              positionText: "No data",
              positionTone: "muted",
            },
          ],
          subtitle: "Waiting for first check",
          title: "Recently added",
        },
      ],
      lastCheckAt: null,
      lastCheckEverAt: null,
      state: "no-data",
    } satisfies OverviewView;

    render(
      <OverviewNoData
        budgetExhausted={false}
        getFirstCheckRunPlanAction={vi.fn().mockResolvedValue(readyPlan)}
        overview={overview}
        projectId="prj_1"
        projectRef="prj_1"
        queueFirstChecksAction={vi.fn().mockResolvedValue({ queued: 1 })}
        runningCheckCount={0}
        runCheckNowAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Added 3 months ago · first check pending")).toBeInTheDocument();
    expect(screen.queryByText("Added today · first check pending")).not.toBeInTheDocument();
  });
});
