import { ProjectRankTrackerMessages } from "@/components/rank-tracker/ProjectRankTrackerMessages";
import {
  projectRankTrackerFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, render as renderDom, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWriteModeProvider } from "../../shell/ProjectWriteModeProvider";
import { KeywordsGridNotices } from "./KeywordsGridNotices";

function render(children: ReactNode) {
  const result = renderDom(<ProjectRankTrackerMessages>{children}</ProjectRankTrackerMessages>);
  return {
    ...result,
    rerender(nextChildren: ReactNode) {
      result.rerender(<ProjectRankTrackerMessages>{nextChildren}</ProjectRankTrackerMessages>);
    },
  };
}

const readyPlan = {
  budget: { capCents: 1000, spentCents: 100 },
  budgetExhausted: false,
  estimatedCostPerCheckCents: 0.1,
  isSampleProject: false,
  providerReady: true,
  providers: ["dataforseo"],
  readyCount: 2,
  scope: {
    depth: 100,
    device: "desktop",
    engine: "google",
    frequency: "daily",
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
  beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("does not show historical failures after the current problem has cleared", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: false, spentCents: 0 },
        currentFailures: { count: 0, latestCheckId: null },
        failed24h: { count: 3, latest: null },
        providerRate: { overrideCents: null, providerId: null },
      },
      checkStates: ["never_checked"],
    });
    expect(
      screen.queryByText("Rank checks failed to produce ranking data."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No rankings yet")).toBeInTheDocument();
  });

  it("remembers dismissal for this incident and shows a new failure or another project", async () => {
    function notice(checkId: string, projectId = "prj_1") {
      return (
        <KeywordsGridNotices
          canManageProviders
          checkStates={["failed"]}
          projectId={projectId}
          rowCount={1}
          getFirstCheckRunPlanAction={vi.fn()}
          queueFirstChecksAction={vi.fn()}
          checkHealth={{
            budget: { capCents: 1000, exhausted: false, spentCents: 0 },
            currentFailures: { count: 1, latestCheckId: checkId },
            failed24h: { count: 3, latest: null },
            providerRate: { overrideCents: null, providerId: null },
          }}
        />
      );
    }
    const first = render(notice("check_first"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss alert" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Dismiss alert" })).not.toBeInTheDocument(),
    );
    first.unmount();
    const next = render(notice("check_first"));
    expect(
      screen.queryByText("Rank checks failed to produce ranking data."),
    ).not.toBeInTheDocument();
    next.rerender(notice("check_new"));
    expect(screen.getByRole("button", { name: "Dismiss alert" })).toBeInTheDocument();
    next.rerender(notice("check_first", "prj_other"));
    expect(screen.getByRole("button", { name: "Dismiss alert" })).toBeInTheDocument();
  });

  it("localizes the first-check defaults when this host supplies only its action and count", () => {
    const messages = structuredClone(projectRankTrackerFeatureTestMessages);
    messages.projectRankTracker.list.notices.firstCheckDetail =
      "{count, plural, =0 {Dodaj slowa kluczowe.} one {# slowo kluczowe czeka.} other {# slowa kluczowe czekaja.}}";
    messages.projectRankTracker.list.notices.firstCheckTitle = "Brak pozycji";

    renderWithFeatureMessages(
      <KeywordsGridNotices
        canManageProviders
        checkStates={["never_checked"]}
        getFirstCheckRunPlanAction={vi.fn().mockResolvedValue(readyPlan)}
        projectId="prj_1"
        queueFirstChecksAction={vi.fn().mockResolvedValue({ queued: 0 })}
        rowCount={1}
      />,
      { locale: "pl", messages },
    );

    expect(screen.getByText("Brak pozycji")).toBeInTheDocument();
    expect(screen.getByText("1 slowo kluczowe czeka.")).toBeInTheDocument();
    expect(screen.queryByText("No rankings yet")).not.toBeInTheDocument();
  });

  it("shows failed-check copy instead of a connect-provider cause when a provider is connected", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: false, spentCents: 100 },
        failed24h: {
          count: 1,
          latest: {
            error: "Provider timeout",
            errorCode: "provider_transient",
            keyword: "rank tracker",
            provider: "serpapi",
          },
        },
        providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
      },
      checkStates: ["failed", "failed"],
      providerConnected: true,
    });

    const title = screen.getByText("Rank checks failed to produce ranking data.");
    expect(title).toBeInTheDocument();
    expect(title.closest("output")?.parentElement).not.toHaveClass("border-b");
    expect(screen.getByText("Some keyword positions could not be updated.")).toBeInTheDocument();
    const reviewLink = screen.getByRole("link", { name: "Review check runs" });
    expect(reviewLink.querySelector("svg")).not.toBeInTheDocument();
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
    expect(screen.getByText("No rankings yet")).toBeInTheDocument();
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
    const confirmButton = screen.getByRole("button", { name: "Confirm and run" });
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
    const confirmButton = screen.getByRole("button", { name: "Confirm and run" });
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

  it("does not render a legacy budget notice on the keyword surface", () => {
    renderNotices({
      checkHealth: {
        budget: { capCents: 1000, exhausted: true, spentCents: 1000 },
        failed24h: { count: 0, latest: null },
        providerRate: { overrideCents: 0.1, providerId: "dataforseo" },
      },
      checkStates: ["never_checked"],
      providerConnected: true,
    });

    expect(screen.queryByText(/budget reached/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit budget" })).not.toBeInTheDocument();
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
