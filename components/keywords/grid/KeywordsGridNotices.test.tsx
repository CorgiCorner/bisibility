import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectWriteModeProvider } from "../../shell/ProjectWriteModeProvider";
import { KeywordsGridNotices } from "./KeywordsGridNotices";

const readyPlan = {
  budget: { capCents: 1000, spentCents: 100 },
  budgetExhausted: false,
  estimatedCostPerCheckCents: 0.1,
  isSampleProject: false,
  providerReady: true,
  providers: ["dataforseo"],
  readyCount: 2,
  scope: {
    depth: "Top 100",
    device: "Desktop",
    engine: "Google",
    frequency: "Daily",
    location: "United States",
  },
};

function renderNotices(props: Partial<ComponentProps<typeof KeywordsGridNotices>> = {}) {
  return render(
    <KeywordsGridNotices
      canManageProviders
      checkStates={[]}
      getFirstCheckRunPlanAction={vi.fn().mockResolvedValue(readyPlan)}
      projectId="prj_1"
      queueFirstChecksAction={vi.fn().mockResolvedValue({ queued: 1 })}
      rowCount={2}
      {...props}
    />,
  );
}

describe("KeywordsGridNotices", () => {
  it("renders the truncation banner when the total count exceeds loaded rows", () => {
    renderNotices({ rowCount: 1000, totalKeywordCount: 1001 });

    expect(screen.getByText("Showing the 1,000 most recently added keywords")).toBeInTheDocument();
    expect(screen.getByText(/This project tracks 1,001 keywords/)).toBeInTheDocument();
  });

  it("does not render the truncation banner when the total count equals loaded rows", () => {
    renderNotices({ rowCount: 1000, totalKeywordCount: 1000 });

    expect(screen.queryByText(/most recently added keywords/)).not.toBeInTheDocument();
  });

  it("does not render the truncation banner when the total count is unknown", () => {
    renderNotices({ rowCount: 1000 });

    expect(screen.queryByText(/most recently added keywords/)).not.toBeInTheDocument();
  });

  it("shows failed-check copy instead of a connect-provider cause when a provider is connected", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: false, spentCents: 100 },
        failed24h: {
          count: 1,
          latest: { error: "Provider timeout", keyword: "rank tracker", provider: "serpapi" },
        },
        providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
      },
      checkStates: ["failed", "failed"],
      providerConnected: true,
    });

    expect(screen.getByText("Rank checks failed to produce ranking data.")).toBeInTheDocument();
    expect(screen.queryByText(/connect a serp provider/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /connect provider/i })).not.toBeInTheDocument();
  });

  it("only offers provider connection when absence is explicitly known", () => {
    const { rerender } = renderNotices({
      checkStates: ["never_checked", "never_checked"],
      providerConnected: false,
    });

    expect(screen.getByRole("link", { name: /connect provider/i })).toBeInTheDocument();

    rerender(
      <KeywordsGridNotices
        canManageProviders
        checkStates={["never_checked"]}
        getFirstCheckRunPlanAction={vi.fn().mockResolvedValue(readyPlan)}
        projectId="prj_1"
        queueFirstChecksAction={vi.fn().mockResolvedValue({ queued: 0 })}
        rowCount={1}
      />,
    );
    expect(screen.queryByRole("link", { name: /connect provider/i })).not.toBeInTheDocument();
    expect(screen.getByText("No rankings yet.")).toBeInTheDocument();
    expect(screen.getByText("1 keyword is ready for the first rank check.")).toBeInTheDocument();
  });

  it("confirms before starting one pending keyword when the provider is ready", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({ status: "queued" });
    renderNotices({
      checkStates: ["never_checked", "never_checked"],
      firstPendingKeywordId: "kw_pending",
      providerConnected: true,
      runCheckNowAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));

    expect(runCheckNowAction).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Run first check" })).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "Confirm & run" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(runCheckNowAction).toHaveBeenCalledWith({ keywordId: "kw_pending" }),
    );
  });

  it("queues the remaining ready keywords when all are selected", async () => {
    const queueFirstChecksAction = vi.fn().mockResolvedValue({ queued: 1 });
    const runCheckNowAction = vi.fn().mockResolvedValue({ status: "running" });
    renderNotices({
      checkStates: ["never_checked", "never_checked"],
      firstPendingKeywordId: "kw_pending",
      providerConnected: true,
      queueFirstChecksAction,
      runCheckNowAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));
    const allReady = await screen.findByRole("radio", { name: "All ready (2)" });
    fireEvent.click(allReady);
    const confirmButton = screen.getByRole("button", { name: "Confirm & run" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(queueFirstChecksAction).toHaveBeenCalledWith({
        excludeKeywordIds: ["kw_pending"],
        projectId: "prj_1",
      }),
    );
    expect(runCheckNowAction).toHaveBeenCalledWith({ keywordId: "kw_pending" });
  });

  it("shows the monthly budget block before queued copy", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: true, spentCents: 1000 },
        failed24h: { count: 0, latest: null },
        providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
      },
      checkStates: ["never_checked"],
      providerConnected: true,
    });

    expect(screen.getByText("Rank checks paused - monthly budget reached.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View check runs" })).toHaveAttribute(
      "href",
      appPath("prj_1", "checks"),
    );
    expect(screen.getByRole("link", { name: "Raise the budget" })).toHaveAttribute(
      "href",
      `${appPath("prj_1", "settings")}#provider-usage`,
    );
    expect(screen.queryByText(/first check pending/i)).not.toBeInTheDocument();
  });

  it("shows the migration hold instead of claiming checks are queued", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <KeywordsGridNotices
          canManageProviders
          checkStates={["never_checked"]}
          getFirstCheckRunPlanAction={vi.fn().mockResolvedValue(readyPlan)}
          projectId="prj_1"
          queueFirstChecksAction={vi.fn().mockResolvedValue({ queued: 0 })}
          rowCount={1}
        />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByText("Rank checks paused - migration hold.")).toBeInTheDocument();
    expect(screen.queryByText(/first check pending/i)).not.toBeInTheDocument();
  });
});
