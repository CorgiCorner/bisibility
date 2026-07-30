import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepFirstCheck } from "./StepFirstCheck";
import { type FirstCheckRunActions, useFirstCheckRun } from "./use-first-check-run";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderReadyStep(overrides: Partial<Parameters<typeof StepFirstCheck>[0]> = {}) {
  return render(
    <StepFirstCheck
      flowState={{ projectId: "prj_1", providerId: "dataforseo" }}
      getObservedPositionsAction={vi.fn(async () => [])}
      keywordCount={3}
      listFirstCheckCandidatesAction={vi.fn(async () => ({
        candidates: [
          { id: "keyword_1", publicId: "kw_1", text: "rank tracker" },
          { id: "keyword_2", publicId: "kw_2", text: "seo api" },
        ],
        hasAnalyticsSource: false,
        isSampleProject: false,
        providerReady: true,
      }))}
      providerConnected
      queueFirstChecksAction={vi.fn(async () => ({ queued: 1 }))}
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
        void start({ mode: "preview", projectId: "prj_1" });
        void start({ mode: "preview", projectId: "prj_1" });
      }}
      type="button"
    >
      Start twice
    </button>
  );
}

describe("StepFirstCheck", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("renders preview rows incrementally and excludes previewed keywords from the queue", async () => {
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
    const queueFirstChecksAction = vi.fn(async () => ({ queued: 1 }));
    const runFirstCheckPreviewAction = vi.fn((input: { keywordId: string }) =>
      input.keywordId === "keyword_1" ? first.promise : second.promise,
    );

    renderReadyStep({ queueFirstChecksAction, runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: /Run first checks now/i }));

    await waitFor(() => expect(screen.getAllByText("Checking...")).toHaveLength(3));
    await waitFor(() => expect(runFirstCheckPreviewAction).toHaveBeenCalledTimes(1));
    expect(runFirstCheckPreviewAction).toHaveBeenLastCalledWith({ keywordId: "keyword_1" });
    expect(queueFirstChecksAction).not.toHaveBeenCalled();

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
    expect(await screen.findByText("#4 · example.com/page")).toBeInTheDocument();
    await waitFor(() => expect(queueFirstChecksAction).toHaveBeenCalledTimes(1));
    expect(queueFirstChecksAction).toHaveBeenCalledWith({
      excludeKeywordIds: ["keyword_1", "keyword_2"],
      projectId: "prj_1",
    });
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

  it("keeps failed preview candidates queueable", async () => {
    const queueFirstChecksAction = vi.fn(async () => ({ queued: 1 }));
    const runFirstCheckPreviewAction = vi.fn(async (input: { keywordId: string }) =>
      input.keywordId === "keyword_1"
        ? {
            position: 2,
            provider: "dataforseo",
            rankingUrl: "https://example.com/rank-tracker",
            status: "completed" as const,
          }
        : {
            code: "budget_exhausted" as const,
            message: "Monthly rank-check budget reached.",
            status: "failed" as const,
          },
    );

    renderReadyStep({ queueFirstChecksAction, runFirstCheckPreviewAction });
    fireEvent.click(screen.getByRole("button", { name: /Run first checks now/i }));

    expect(await screen.findByText("Monthly rank-check budget reached.")).toBeInTheDocument();
    await waitFor(() => expect(queueFirstChecksAction).toHaveBeenCalledTimes(1));
    expect(queueFirstChecksAction).toHaveBeenCalledWith({
      excludeKeywordIds: ["keyword_1"],
      projectId: "prj_1",
    });
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

    fireEvent.click(
      screen.getByRole("button", { name: /Show observed positions from Search Console/i }),
    );

    expect(
      await screen.findByText("Observed #5.4 · 12 clicks · 120 impressions"),
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

    fireEvent.click(
      screen.getByRole("button", { name: /Show observed positions from Search Console/i }),
    );

    expect(await screen.findByText(/can lag by about 3 days/i)).toBeInTheDocument();
  });

  it("does not block opening the dashboard while preview is running", async () => {
    const never = new Promise<never>(() => undefined);
    const { container } = renderReadyStep({
      runFirstCheckPreviewAction: vi.fn(() => never),
    });

    fireEvent.click(screen.getByRole("button", { name: /Run first checks now/i }));
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(push).toHaveBeenCalledWith(appPath("prj_1", "overview")));
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

    expect(screen.getByRole("button", { name: /Run first checks now/i })).not.toBeDisabled();
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

    expect(screen.getByRole("button", { name: /Sample project preview only/i })).toBeDisabled();
    expect(
      screen.getByText("Sample projects keep their synthetic ranking history."),
    ).toBeInTheDocument();
  });
});
