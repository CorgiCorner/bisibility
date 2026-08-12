import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui";
import type { KeywordCheckState } from "@/lib/queries/keyword-row-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

function renderDetail(
  state: Exclude<KeywordCheckState, "ranked">,
  overrides: Partial<Parameters<typeof KeywordPendingDetail>[0]> = {},
) {
  const runCheckNowAction = vi.fn(async () => undefined);
  render(
    <ToastProvider>
      <KeywordPendingDetail
        canUpdateKeyword
        createKeywordAlertAction={vi.fn(async () => undefined)}
        keyword={keyword(state)}
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
  return runCheckNowAction;
}

describe("KeywordPendingDetail", () => {
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
      expect(screen.getByText(position)).toBeInTheDocument();
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
      expect(screen.getByText(title).closest(".bg-bg-sunken")).toHaveTextContent(body);
    },
  );

  it("keeps what changed independent from rank state", () => {
    const { rerender } = render(
      <KeywordPendingDetail
        canUpdateKeyword
        keyword={keyword("failed")}
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
        projectId="prj_1"
        projectRef="prj_1"
        providerConnected
        rankState="failed"
        runCheckNowAction={vi.fn()}
        updateKeywordAction={vi.fn()}
        whatChanged="diff"
      />,
    );

    expect(screen.getByText("Position improved #5 → #3")).toBeInTheDocument();
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

  it("runs the state-specific split CTA at its selected depth", async () => {
    const runCheckNowAction = renderDetail("never_checked");
    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));
    await waitFor(() =>
      expect(runCheckNowAction).toHaveBeenCalledWith({ depth: 20, keywordId: keywordRows[0].id }),
    );
  });

  it("uses the provider connection CTA without changing the Search Console modules", () => {
    renderDetail("never_checked", { providerConnected: false });
    expect(screen.getByRole("link", { name: /Connect a SERP provider/ })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
  });
});
