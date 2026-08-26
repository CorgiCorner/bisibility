import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui";
import type { KeywordCheckState } from "@/lib/queries/keyword-row-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/rank-check-status", () => ({ getRankCheckStatus: vi.fn() }));

const CHECK_ID = "check_abcdefghijklmnopqrstuvwx";

function keyword(state: Exclude<KeywordCheckState, "ranked">): KeywordRow {
  return {
    ...keywordRows[0],
    checkState: state,
    hasRankData: false,
    position: 101,
    positionHistory: [],
    rankingUrl: null,
    rankingUrlHistory: [],
    targetUrl: "/preferred",
    trackedDepth: 20,
  };
}

function completedPollResult(position = 12, requestedDepth = 100) {
  return {
    errorCode: null,
    error: null,
    finishedAt: "2026-08-21T12:00:00.000Z",
    position,
    requestedDepth,
    status: "completed" as const,
  };
}

function failedPollResult(errorCode = "provider_billing") {
  return {
    errorCode,
    error: "fail",
    finishedAt: "2026-08-21T12:00:00.000Z",
    position: null,
    requestedDepth: null,
    status: "failed" as const,
  };
}

function renderDetail(
  state: Exclude<KeywordCheckState, "ranked">,
  overrides: Partial<Parameters<typeof KeywordPendingDetail>[0]> = {},
) {
  const runCheckNowAction = vi.fn(async () => ({ rankCheckId: CHECK_ID, status: "running" }));
  const pollAction = vi.fn(async () => ({
    errorCode: null,
    error: null,
    finishedAt: null,
    position: null,
    requestedDepth: null,
    status: "running",
  }));
  render(
    <ToastProvider>
      <KeywordPendingDetail
        canUpdateKeyword
        createKeywordAlertAction={vi.fn(async () => undefined)}
        keyword={keyword(state)}
        pollAction={pollAction}
        projectId="prj_1"
        projectRef="prj_1"
        providerConnected
        rankState={state}
        runCheckNowAction={runCheckNowAction}
        updateKeywordAction={vi.fn()}
        {...overrides}
      />
    </ToastProvider>,
  );
  return { pollAction, runCheckNowAction };
}

async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advanceAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("KeywordPendingDetail", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
    vi.useRealTimers();
  });

  it.each([
    [
      "never_checked",
      "No data",
      "First check has not run yet.",
      "Position history",
      "text-fg-muted",
    ],
    [
      "not_ranked",
      "Not in top 20",
      "Outside the tracked depth on the last check.",
      "Position history",
      "text-yellow-text",
    ],
    ["failed", "No data", "The last check returned an error.", "Position history", "text-red-text"],
    [
      "running",
      "No data",
      "The provider is fetching results for this keyword. The page updates as soon as the check completes.",
      "Rank check in progress",
      "text-blue-text",
    ],
  ] as const)(
    "keeps the %s state in modules, not header chrome",
    (state, position, body, title, color) => {
      const { container } = render(
        <KeywordPendingDetail
          canUpdateKeyword
          createKeywordAlertAction={vi.fn(async () => undefined)}
          keyword={keyword(state)}
          pollAction={vi.fn()}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected
          rankState={state}
          runCheckNowAction={vi.fn()}
          updateKeywordAction={vi.fn()}
        />,
      );

      expect(screen.getByLabelText("Keyword check metadata")).toHaveTextContent(
        "Target /preferred",
      );
      expect(screen.getAllByText(position).length).toBeGreaterThan(0);
      expect(screen.getAllByText(body)).not.toHaveLength(0);
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(container.querySelector(`.${color}`)).toBeInTheDocument();
      expect(screen.getAllByText("No ranking URL yet")).toHaveLength(2);
      expect(screen.getByText("No URL ranking yet")).toBeInTheDocument();
      expect(screen.queryByText("Previous")).not.toBeInTheDocument();
      expect(screen.queryByText("Best")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["never_checked", "No ranking data yet", "First check has not run yet."],
    ["not_ranked", "Not ranked in the top 20", "Outside the tracked depth on the last check."],
    ["failed", "No position from the latest check", "The last check returned an error."],
    [
      "running",
      "Rank check in progress",
      "The provider is fetching results for this keyword. The page updates as soon as the check completes.",
    ],
  ] as const)(
    "renders the %s rank-state copy once inside the position panel",
    (state, title, body) => {
      renderDetail(state);

      expect(screen.getAllByRole("heading", { name: "Position history" })).toHaveLength(1);
      expect(screen.getAllByText(title)).toHaveLength(1);
      expect(screen.getAllByText(body)).toHaveLength(1);
      expect(screen.getByText(title).closest(".min-h-\\[176px\\]")).toHaveTextContent(body);
      expect(screen.getByText(title).closest(".bg-bg-sunken")).toBeNull();
    },
  );

  it.each([
    ["never_checked", "No ranking data yet", "bg-accent-soft", "text-accent-solid"],
    ["not_ranked", "Not ranked in the top 20", "bg-accent-soft", "text-yellow-text"],
    ["failed", "No position from the latest check", "bg-accent-soft", "text-red-text"],
    ["running", "Rank check in progress", "bg-accent-soft", "text-blue-text"],
  ] as const)("puts the %s history glyph on the icon-well token", (state, title, fill, ink) => {
    renderDetail(state);
    const well = screen.getByText(title).previousElementSibling;
    expect(well).toHaveClass(fill, ink);
    expect(well).not.toHaveClass("bg-bg-sunken");
  });

  it("keeps context chips on the quiet-chip sunken token", () => {
    renderDetail("never_checked");
    expect(screen.getByText("CPC").parentElement).toHaveClass("bg-bg-sunken");
  });

  it("keeps what changed independent from rank state", () => {
    const { rerender } = render(
      <KeywordPendingDetail
        canUpdateKeyword
        keyword={keyword("failed")}
        pollAction={vi.fn()}
        projectId="prj_1"
        projectRef="prj_1"
        providerConnected
        rankState="failed"
        runCheckNowAction={vi.fn()}
        updateKeywordAction={vi.fn()}
        whatChanged="no_change"
      />,
    );

    expect(
      screen.getByText("No changes since the previous check").parentElement?.querySelector("svg"),
    ).not.toBeNull();
    rerender(
      <KeywordPendingDetail
        canUpdateKeyword
        keyword={keyword("failed")}
        pollAction={vi.fn()}
        projectId="prj_1"
        projectRef="prj_1"
        providerConnected
        rankState="failed"
        runCheckNowAction={vi.fn()}
        updateKeywordAction={vi.fn()}
        whatChanged="first_check"
      />,
    );
    expect(screen.queryByText("First check collected.")).not.toBeInTheDocument();
    expect(screen.queryByText("No changes since the previous check")).not.toBeInTheDocument();
  });

  it("keeps a rank-only change truthful when the latest check is pending", () => {
    render(
      <KeywordPendingDetail
        canUpdateKeyword
        keyword={{
          ...keyword("failed"),
          positionHistory: [
            { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 5 },
            { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
          ],
          rankingUrlHistory: [
            {
              endAt: "2026-08-10T10:00:00.000Z",
              isCurrent: true,
              note: "Current",
              position: 3,
              requestedDepth: 20,
              startAt: "2026-08-09T10:00:00.000Z",
              url: "https://example.com/rank-tracker",
            },
          ],
        }}
        pollAction={vi.fn()}
        projectId="prj_1"
        projectRef="prj_1"
        providerConnected
        rankState="failed"
        runCheckNowAction={vi.fn()}
        updateKeywordAction={vi.fn()}
        whatChanged="diff"
      />,
    );

    expect(screen.getByText("Position improved #5 \u2192 #3")).toBeInTheDocument();
    expect(screen.queryByText("Ranking URL changed")).not.toBeInTheDocument();
  });

  it("explains when a completed check leaves tracked results", () => {
    renderDetail("not_ranked", {
      keyword: {
        ...keyword("not_ranked"),
        completedComparableChecks: [
          {
            checkedAt: "2026-08-09T10:00:00.000Z",
            position: 3,
            rankingUrl: "https://example.com/rank-tracker",
          },
          { checkedAt: "2026-08-10T10:00:00.000Z", position: null, rankingUrl: null },
        ],
      },
      whatChanged: "diff",
    });

    expect(screen.getByText("Position left tracked results")).toBeInTheDocument();
    expect(screen.queryByText("No detailed change data available.")).not.toBeInTheDocument();
    expect(screen.queryByText("#0")).not.toBeInTheDocument();
    expect(screen.queryByText("-", { exact: true })).not.toBeInTheDocument();
  });

  it.each(["failed", "running"] as const)(
    "does not repeat a previous ranking URL in the %s header",
    (rankState) => {
      render(
        <KeywordPendingDetail
          canUpdateKeyword
          keyword={{
            ...keyword(rankState),
            positionHistory: [
              { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 3 },
            ],
            rankingUrl: "https://example.com/headless-cms",
            rankingUrlHistory: [
              {
                endAt: "2026-08-09T10:00:00.000Z",
                isCurrent: true,
                note: "Current",
                position: 3,
                requestedDepth: 20,
                startAt: "2026-08-09T10:00:00.000Z",
                url: "https://example.com/headless-cms",
              },
            ],
          }}
          pollAction={vi.fn()}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected
          rankState={rankState}
          runCheckNowAction={vi.fn()}
          updateKeywordAction={vi.fn()}
        />,
      );

      const metadata = screen.getByLabelText("Keyword check metadata");
      expect(metadata).toHaveTextContent("Ranking No ranking URL yet");
      expect(metadata).not.toHaveTextContent("/headless-cms");
      expect(screen.getAllByText("No ranking URL yet")).toHaveLength(2);
    },
  );

  it("uses one running state title and one supporting sentence", () => {
    renderDetail("running");

    expect(screen.getAllByText("Rank check in progress")).toHaveLength(1);
    expect(
      screen.getAllByText(
        "The provider is fetching results for this keyword. The page updates as soon as the check completes.",
      ),
    ).toHaveLength(1);
    expect(screen.queryByText("Check in progress.")).not.toBeInTheDocument();
    expect(screen.queryByText("Check in progress")).not.toBeInTheDocument();
  });

  it("confirms the first check, polls, then shows success with position", async () => {
    const pollAction = vi.fn().mockResolvedValue(completedPollResult(12, 100));
    const runCheckNowAction = vi
      .fn()
      .mockResolvedValue({ rankCheckId: CHECK_ID, status: "running" });
    render(
      <ToastProvider>
        <KeywordPendingDetail
          canUpdateKeyword
          createKeywordAlertAction={vi.fn(async () => undefined)}
          keyword={keyword("never_checked")}
          pollAction={pollAction}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected
          rankState="never_checked"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check (Top 20)" }));
    expect(screen.getByRole("dialog", { name: "Run rank check" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & run" }));
    await flushMicrotasks();
    expect(runCheckNowAction).toHaveBeenCalledWith({ depth: 20, keywordId: keywordRows[0].id });
    expect(screen.getByRole("dialog", { name: "Check running" })).toBeInTheDocument();

    await advanceAndFlush(2000);
    expect(screen.getByRole("dialog", { name: "Check complete" })).toBeInTheDocument();
    expect(screen.getByText("Ranked #12 in the top 100.")).toBeInTheDocument();
  });

  it("keeps the header check enabled while the first check is processing", async () => {
    let finish: ((value: { rankCheckId: string; status: "running" }) => void) | undefined;
    const runCheckNowAction = vi.fn(
      () =>
        new Promise<{ rankCheckId: string; status: "running" }>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <ToastProvider>
        <KeywordPendingDetail
          canUpdateKeyword
          createKeywordAlertAction={vi.fn(async () => undefined)}
          keyword={keyword("never_checked")}
          pollAction={vi.fn()}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected
          rankState="never_checked"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    const runButton = screen.getByRole("button", { name: "Run first check (Top 20)" });
    fireEvent.click(runButton);
    fireEvent.click(screen.getByRole("button", { name: "Confirm & run" }));
    await flushMicrotasks();
    expect(screen.getByRole("status")).toHaveTextContent("The check is processing now.");
    expect(runButton).toBeEnabled();
    finish?.({ rankCheckId: CHECK_ID, status: "running" });
    await flushMicrotasks();
    expect(screen.getByRole("dialog", { name: "Check running" })).toBeInTheDocument();
    expect(runButton).toBeEnabled();
  });

  it("uses the provider connection CTA without changing the Search Console modules", () => {
    render(
      <ToastProvider>
        <KeywordPendingDetail
          canUpdateKeyword
          createKeywordAlertAction={vi.fn(async () => undefined)}
          keyword={keyword("never_checked")}
          pollAction={vi.fn()}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected={false}
          rankState="never_checked"
          runCheckNowAction={vi.fn()}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );
    expect(screen.getByRole("link", { name: /Connect a SERP provider/ })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
  });

  it("shows billing failure copy with both CTAs after a failed poll", async () => {
    const pollAction = vi.fn().mockResolvedValue(failedPollResult("provider_billing"));
    const runCheckNowAction = vi
      .fn()
      .mockResolvedValue({ rankCheckId: CHECK_ID, status: "running" });
    render(
      <ToastProvider>
        <KeywordPendingDetail
          canUpdateKeyword
          createKeywordAlertAction={vi.fn(async () => undefined)}
          keyword={keyword("never_checked")}
          pollAction={pollAction}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected
          rankState="never_checked"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check (Top 20)" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & run" }));
    await flushMicrotasks();
    await advanceAndFlush(2000);
    expect(screen.getByRole("dialog", { name: "Check failed" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "The rank check could not run because the provider account has insufficient funds. Add funds or connect a different provider, then try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open integrations" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("closes while running without cancelling the poll", async () => {
    const pollAction = vi.fn().mockResolvedValue(completedPollResult(5, 20));
    const runCheckNowAction = vi
      .fn()
      .mockResolvedValue({ rankCheckId: CHECK_ID, status: "running" });
    render(
      <ToastProvider>
        <KeywordPendingDetail
          canUpdateKeyword
          createKeywordAlertAction={vi.fn(async () => undefined)}
          keyword={keyword("never_checked")}
          pollAction={pollAction}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected
          rankState="never_checked"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check (Top 20)" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & run" }));
    await flushMicrotasks();
    expect(screen.getByRole("dialog", { name: "Check running" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await advanceAndFlush(250);
    expect(screen.queryByRole("dialog", { name: "Check running" })).not.toBeInTheDocument();

    await advanceAndFlush(2000);
    expect(pollAction).toHaveBeenCalledTimes(1);
  });

  it("enters success immediately for a synchronous completed response", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({
      rankCheckId: CHECK_ID,
      status: "completed",
      position: 3,
      requestedDepth: 20,
    });
    render(
      <ToastProvider>
        <KeywordPendingDetail
          canUpdateKeyword
          createKeywordAlertAction={vi.fn(async () => undefined)}
          keyword={keyword("never_checked")}
          pollAction={vi.fn()}
          projectId="prj_1"
          projectRef="prj_1"
          providerConnected
          rankState="never_checked"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check (Top 20)" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & run" }));
    await flushMicrotasks();
    expect(screen.getByRole("dialog", { name: "Check complete" })).toBeInTheDocument();
    expect(screen.getByText("Ranked #3 in the top 20.")).toBeInTheDocument();
  });
});
