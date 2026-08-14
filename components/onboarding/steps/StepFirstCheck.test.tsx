import { appPath } from "@/lib/routing/app-path";
import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepFirstCheck } from "./StepFirstCheck";
import { type FirstCheckRunActions, useFirstCheckRun } from "./use-first-check-run";

function candidate(id: string, text: string, device: "desktop" | "mobile" = "desktop") {
  return {
    device,
    id,
    market: { languageLabel: "English", locationLabel: "United States" },
    publicId: `kw_${id}`,
    text,
  };
}

function renderReadyStep(overrides: Partial<Parameters<typeof StepFirstCheck>[0]> = {}) {
  return render(
    <StepFirstCheck
      flowState={{ projectId: "prj_1", providerId: "dataforseo" }}
      getObservedPositionsAction={vi.fn(async () => [])}
      keywordCount={3}
      keywordDraft="rank tracker\nseo api"
      listFirstCheckCandidatesAction={vi.fn(async () => ({
        candidates: [
          candidate("keyword_1", "rank tracker"),
          candidate("keyword_2", "rank tracker", "mobile"),
        ],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      }))}
      providerConnected
      runFirstCheckPreviewAction={vi.fn(async () => ({
        position: 2,
        provider: "dataforseo",
        rankingUrl: "https://example.com/rank-tracker",
        status: "completed" as const,
      }))}
      {...overrides}
    />,
  );
}

function DoubleStartHarness({ actions }: { actions: FirstCheckRunActions }) {
  const { start, state } = useFirstCheckRun(actions);
  return (
    <button
      data-status={state.status}
      onClick={() => {
        void start({ keywordText: "rank tracker", mode: "preview", projectId: "prj_1" });
        void start({ keywordText: "rank tracker", mode: "preview", projectId: "prj_1" });
      }}
      type="button"
    >
      Start twice
    </button>
  );
}

function MissingKeywordHarness({ actions }: { actions: FirstCheckRunActions }) {
  const { start, state } = useFirstCheckRun(actions);
  return (
    <div>
      <button onClick={() => void start({ mode: "preview", projectId: "prj_1" })} type="button">
        Start without keyword
      </button>
      <span>{state.message}</span>
    </div>
  );
}

describe("StepFirstCheck", () => {
  it("renders the complete review table and final-step footer contract", () => {
    renderReadyStep({
      defaults: {
        city: null,
        country: "United States",
        cronExpression: "0 6 * * *",
        device: "desktop",
        devices: ["desktop", "mobile"],
        frequency: "daily",
        jitterMinutes: 60,
        locationKey: "US",
        locationSelections: [
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
        ],
        locations: ["US"],
        projectId: "prj_1",
        serpDepth: 100,
        timezone: "UTC",
      },
      keywordDraft: "rank tracker\nseo api",
    });

    for (const label of [
      "Project",
      "Provider",
      "Keywords",
      "Scope",
      "Markets",
      "First check",
      "Sample keyword",
      "Next scheduled run",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Keyword used for the sample checks" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project timezone" })).toBeInTheDocument();
    expect(screen.getByText("Daily schedule")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run 2 sample checks" })).toBeInTheDocument();
  });

  it("runs the selected keyword across the market and device matrix", async () => {
    const listFirstCheckCandidatesAction = vi.fn(async () => ({
      candidates: [],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    }));
    renderReadyStep({
      defaults: {
        city: null,
        country: "United States",
        cronExpression: "0 6 * * *",
        device: "desktop",
        devices: ["desktop", "mobile"],
        frequency: "daily",
        jitterMinutes: 60,
        locationKey: "US",
        locationSelections: [
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
          {
            canonicalKey: "ES@en",
            countryCode: "ES",
            displayName: "Spain",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
          },
        ],
        locations: ["US", "ES@en"],
        projectId: "prj_1",
        serpDepth: 100,
        timezone: "UTC",
      },
      keywordDraft: "rank tracker\nseo api",
      listFirstCheckCandidatesAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Keyword used for the sample checks" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "seo api" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 4 sample checks" }));

    await waitFor(() =>
      expect(listFirstCheckCandidatesAction).toHaveBeenCalledWith({
        keywordText: "seo api",
        limit: 4,
        projectId: "prj_1",
      }),
    );
  });

  it("resumes with one persisted keyword instead of an unfiltered first sentinel", async () => {
    const listFirstCheckCandidatesAction = vi.fn(async () => ({
      candidates: [candidate("keyword_1", "persisted rank tracker")],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    }));
    renderReadyStep({ keywordDraft: undefined, listFirstCheckCandidatesAction });

    expect(screen.queryByText("First available keyword")).not.toBeInTheDocument();
    expect(await screen.findByText("persisted rank tracker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run 1 sample check" }));

    await waitFor(() => expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(2));
    expect(listFirstCheckCandidatesAction).toHaveBeenNthCalledWith(1, {
      limit: 1,
      projectId: "prj_1",
    });
    expect(listFirstCheckCandidatesAction).toHaveBeenNthCalledWith(2, {
      keywordText: "persisted rank tracker",
      limit: 1,
      projectId: "prj_1",
    });
  });

  it("retries a failed resumed keyword load in place and enables preview", async () => {
    let attempts = 0;
    const listFirstCheckCandidatesAction = vi.fn(async () => {
      if (attempts++ === 0) throw new Error("Saved keywords could not be loaded.");
      return {
        candidates: [candidate("keyword_1", "persisted rank tracker")],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      };
    });
    renderReadyStep({ keywordDraft: undefined, listFirstCheckCandidatesAction });

    const loadError = await screen.findByRole("alert");
    expect(loadError).toHaveTextContent("Saved keywords could not be loaded.");
    expect(loadError).toHaveClass("m-0");
    expect(loadError).not.toHaveClass("mt-2");
    expect(screen.getByRole("button", { name: "Run 1 sample check" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading keyword" }));

    expect(await screen.findByText("persisted rank tracker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run 1 sample check" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(2);
  });

  it("restores the saved timezone when an update fails", async () => {
    renderReadyStep({
      defaults: {
        country: "United States",
        cronExpression: "0 6 * * *",
        device: "desktop",
        frequency: "daily",
        jitterMinutes: 60,
        projectId: "prj_1",
        timezone: "UTC",
      },
      onTimezoneChange: vi.fn(async () => {
        throw new Error("save failed");
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Project timezone" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Timezone could not be saved");
    expect(screen.getByRole("button", { name: "Project timezone" })).toHaveTextContent("UTC");
  });

  it("does not expose a live-check action without a provider or analytics", () => {
    renderReadyStep({
      flowState: { projectId: "prj_1", providerId: null },
      hasAnalyticsSource: false,
      providerConnected: false,
    });

    expect(screen.getByRole("link", { name: "Connect a provider" })).toHaveAttribute(
      "href",
      "/onboarding?step=2&projectId=prj_1",
    );
    expect(screen.queryByRole("button", { name: /Run \d+ sample checks?/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeInTheDocument();
  });

  it("renders the selected sample targets incrementally without queuing the remaining keywords", async () => {
    const first = deferred<{
      position: null;
      provider: string;
      rankingUrl: null;
      status: "completed";
    }>();
    const second = deferred<{
      position: number;
      provider: string;
      rankingUrl: string;
      status: "completed";
    }>();
    const runFirstCheckPreviewAction = vi.fn((input: { keywordId: string }) =>
      input.keywordId === "keyword_1" ? first.promise : second.promise,
    );
    const queueFirstChecksAction = vi.fn();
    const legacyQueueAction = { queueFirstChecksAction };

    renderReadyStep({ ...legacyQueueAction, runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: /Run \d+ sample checks?/i }));

    await waitFor(() => expect(screen.getAllByText("Checking...")).toHaveLength(2));
    await waitFor(() => expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(1));
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "keyword_1" });
    expect(screen.getByLabelText("Desktop device")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile device")).toBeInTheDocument();
    expect(screen.getAllByText("United States")).toHaveLength(3);

    first.resolve({
      position: null,
      provider: "dataforseo",
      rankingUrl: null,
      status: "completed",
    });

    await waitFor(() => expect(screen.getByText("Not in top 100")).toBeInTheDocument());
    await waitFor(() => expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(2));
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "keyword_2" });

    second.resolve({
      position: 4,
      provider: "dataforseo",
      rankingUrl: "https://example.com/page",
      status: "completed",
    });
    expect(await screen.findByText("#4 / example.com/page")).toBeInTheDocument();
    expect(
      screen.getByText("Sample done. Every keyword follows your daily schedule from here."),
    ).toBeInTheDocument();
    expect(queueFirstChecksAction).not.toHaveBeenCalled();
  });

  it("runs only one preview when start is called twice before render catches up", async () => {
    const candidates = deferred<{
      candidates: [];
      hasAnalyticsSource: false;
      isSampleProject: false;
      providerReady: true;
    }>();
    const listFirstCheckCandidatesAction = vi.fn(() => candidates.promise);

    render(
      <DoubleStartHarness
        actions={{
          listFirstCheckCandidatesAction,
          runFirstCheckPreviewAction: vi.fn(),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start twice" }));

    await waitFor(() => expect(listFirstCheckCandidatesAction).toHaveBeenCalledTimes(1));
    candidates.resolve({
      candidates: [],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start twice" })).toHaveAttribute(
        "data-status",
        "completed",
      ),
    );
  });

  it("rejects an unscoped preview instead of falling back to multiple keyword texts", async () => {
    const listFirstCheckCandidatesAction = vi.fn();
    render(
      <MissingKeywordHarness
        actions={{ listFirstCheckCandidatesAction, runFirstCheckPreviewAction: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start without keyword" }));

    expect(
      await screen.findByText("Select one keyword for the sample checks."),
    ).toBeInTheDocument();
    expect(listFirstCheckCandidatesAction).not.toHaveBeenCalled();
  });

  it("retries only failed sample targets and keeps successful results", async () => {
    let failedAttempts = 0;
    const runFirstCheckPreviewAction = vi.fn(async (input: { keywordId: string }) => {
      if (input.keywordId === "keyword_2" && failedAttempts++ === 0) {
        return {
          code: "budget_exhausted" as const,
          message: "Monthly rank-check budget reached.",
          status: "failed" as const,
        };
      }
      return {
        position: input.keywordId === "keyword_1" ? 2 : 4,
        provider: "dataforseo",
        rankingUrl: `https://example.com/${input.keywordId}`,
        status: "completed" as const,
      };
    });

    renderReadyStep({ runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: /Run \d+ sample checks?/i }));

    expect(await screen.findByText("Monthly rank-check budget reached.")).toBeInTheDocument();
    expect(screen.getByText("#2 / example.com/keyword_1")).toBeInTheDocument();
    expect(
      screen.getByText("1 of 2 checks failed. Successful results are kept."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));

    expect(await screen.findByText("#4 / example.com/keyword_2")).toBeInTheDocument();
    expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(3);
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "keyword_2" });
    expect(screen.queryByText("Monthly rank-check budget reached.")).not.toBeInTheDocument();
  });

  it("shows observed positions when analytics is connected without a SERP provider", async () => {
    const listFirstCheckCandidatesAction = vi.fn();
    const getObservedPositionsAction = vi.fn(async () => [
      {
        clicks: 12,
        impressions: 120,
        keywordId: "keyword_1",
        position: 5.4,
        text: "rank tracker",
      },
    ]);

    renderReadyStep({
      flowState: { projectId: "prj_1", providerId: null },
      getObservedPositionsAction,
      hasAnalyticsSource: true,
      listFirstCheckCandidatesAction,
      providerConnected: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /Show observed positions/i }));

    expect(
      await screen.findByText("Observed #5.4 / 12 clicks / 120 impressions"),
    ).toBeInTheDocument();
    expect(getObservedPositionsAction).toHaveBeenCalledWith({ projectId: "prj_1" });
    expect(listFirstCheckCandidatesAction).not.toHaveBeenCalled();
  });

  it("shows the analytics lag empty state when observed positions are absent", async () => {
    renderReadyStep({
      flowState: { projectId: "prj_1", providerId: null },
      getObservedPositionsAction: vi.fn(async () => []),
      hasAnalyticsSource: true,
      providerConnected: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /Show observed positions/i }));

    expect(await screen.findByText(/can lag by about 3 days/i)).toBeInTheDocument();
  });

  it("does not block opening the dashboard while preview is running", async () => {
    const never = new Promise<never>(() => undefined);
    renderReadyStep({
      runFirstCheckPreviewAction: vi.fn(() => never),
    });

    fireEvent.click(screen.getByRole("button", { name: /Run \d+ sample checks?/i }));
    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));

    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith(appPath("prj_1", "dashboard")),
    );
  });

  it("reconciles the draft markets and marks onboarding complete before opening the dashboard", async () => {
    const completeOnboardingAction = vi.fn(async () => undefined);
    const saveMarketsAction = vi.fn(async (input) => ({ marketKeys: input.marketKeys }));
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });

    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));

    await waitFor(() => expect(completeOnboardingAction).toHaveBeenCalledTimes(1));
    expect(saveMarketsAction).toHaveBeenCalledWith({ marketKeys: ["US"], projectId: "prj_1" });
    expect(completeOnboardingAction).toHaveBeenCalledWith({ projectId: "prj_1" });
    expect(saveMarketsAction.mock.invocationCallOrder[0]).toBeLessThan(
      completeOnboardingAction.mock.invocationCallOrder[0] ?? 0,
    );
    expect(completeOnboardingAction.mock.invocationCallOrder[0]).toBeLessThan(
      routerMock.push.mock.invocationCallOrder[0] ?? 0,
    );
    expect(routerMock.push).toHaveBeenCalledWith(appPath("prj_1", "dashboard"));
  });

  it("coalesces double submit into one reconcile, completion, and navigation", async () => {
    const saving = deferred<{ marketKeys: string[] }>();
    const saveMarketsAction = vi.fn(() => saving.promise);
    const completeOnboardingAction = vi.fn(async () => undefined);
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });
    const form = screen.getByText("Run your first check").closest("form");
    if (!form) throw new Error("First-check form was not rendered.");

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(saveMarketsAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeDisabled();
    saving.resolve({ marketKeys: ["US"] });
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(completeOnboardingAction).toHaveBeenCalledTimes(1);
  });

  it("stays locked after successful navigation until the step unmounts", async () => {
    const saveMarketsAction = vi.fn(async () => ({ marketKeys: ["US"] }));
    const completeOnboardingAction = vi.fn(async () => undefined);
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });
    const form = screen.getByText("Run your first check").closest("form");
    if (!form) throw new Error("First-check form was not rendered.");

    fireEvent.submit(form);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeDisabled();
    fireEvent.submit(form);

    expect(saveMarketsAction).toHaveBeenCalledTimes(1);
    expect(completeOnboardingAction).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledTimes(1);
  });

  it("recovers from a reconciliation error and allows one successful retry", async () => {
    const completeOnboardingAction = vi.fn(async () => undefined);
    let attempts = 0;
    const saveMarketsAction = vi.fn(async (input) => {
      if (attempts++ === 0) throw new Error("Market selection could not be saved.");
      return { marketKeys: input.marketKeys };
    });
    renderReadyStep({ completeOnboardingAction, saveMarketsAction });

    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Market selection could not be saved.",
    );
    expect(completeOnboardingAction).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(saveMarketsAction).toHaveBeenCalledTimes(2);
    expect(completeOnboardingAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("allows manual preview while automatic checks are paused", () => {
    renderReadyStep({
      defaults: {
        country: "United States",
        cronExpression: null,
        device: "desktop",
        frequency: "paused",
        jitterMinutes: 60,
        projectId: "prj_1",
        timezone: "UTC",
      },
    });

    expect(screen.getByRole("button", { name: /Run \d+ sample checks?/i })).not.toBeDisabled();
    expect(
      screen.getByText("Manual preview can run now. Scheduled checks stay paused."),
    ).toBeInTheDocument();
  });

  it("does not offer live checks for sample projects", () => {
    renderReadyStep({
      flowState: {
        projectId: "prj_a11111111111111111111111",
        providerId: "dataforseo",
      },
      project: {
        domain: "sample.example",
        isSample: true,
        name: "Sample project",
        publicId: "prj_a11111111111111111111111",
      },
      providerConnected: true,
    });

    expect(screen.getByRole("button", { name: "Run 1 sample check" })).toBeDisabled();
    expect(
      screen.getByText("Sample projects keep their synthetic ranking history."),
    ).toBeInTheDocument();
  });
});
