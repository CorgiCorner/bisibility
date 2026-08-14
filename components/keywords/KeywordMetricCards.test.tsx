import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordMetricCards } from "./KeywordMetricCards";

describe("KeywordMetricCards", () => {
  it("renders the reference three-card summary instead of individual metric cards", () => {
    render(<KeywordMetricCards keyword={keywordRows[0]} keywordContext="full" />);

    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("Ranking URL")).toBeInTheDocument();
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(screen.queryByText("Volume", { selector: "p" })).not.toBeInTheDocument();
  });

  it("keeps position delta, previous, and best in the Position summary", () => {
    const keyword: KeywordRow = { ...keywordRows[0], position: 6, positionBaseline: 4 };

    render(<KeywordMetricCards keyword={keyword} keywordContext="full" />);

    expect(screen.getByText("2", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Previous #4")).toBeInTheDocument();
    expect(screen.getByText(/Best #/)).toBeInTheDocument();
  });

  it("uses the minus glyph for unchanged position and never exposes a missing rank as #0", () => {
    const { rerender } = render(
      <KeywordMetricCards
        keyword={{ ...keywordRows[0], positionBaseline: keywordRows[0].position }}
        keywordContext="full"
        whatChanged="diff"
      />,
    );

    expect(
      screen.getByText("No position change").parentElement?.querySelector("svg"),
    ).not.toBeNull();

    rerender(
      <KeywordMetricCards
        keyword={{ ...keywordRows[0], hasRankData: false, position: 0 }}
        keywordContext="full"
      />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.queryByText("#0")).not.toBeInTheDocument();
  });

  it("keeps URL-history state in the summary without suppressing its card", () => {
    const { rerender } = render(
      <KeywordMetricCards keyword={keywordRows[0]} keywordContext="full" whatChanged="no_change" />,
    );

    expect(
      screen.getByText("No changes since the previous check").parentElement?.querySelector("svg"),
    ).not.toBeNull();
    expect(screen.queryByText(/Compared with the check/)).not.toBeInTheDocument();

    rerender(
      <KeywordMetricCards
        keyword={keywordRows[0]}
        keywordContext="full"
        whatChanged="first_check"
      />,
    );
    expect(screen.queryByText("First check collected.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Compared with the check/)).not.toBeInTheDocument();
  });

  it("shows the target mismatch badge and expected path", () => {
    render(
      <KeywordMetricCards
        keyword={{
          ...keywordRows[0],
          rankingUrl: "https://example.com/actual",
          targetUrl: "https://example.com/expected",
        }}
        keywordContext="full"
      />,
    );

    expect(screen.getByText("Target mismatch")).toBeVisible();
    expect(screen.getByText("Expected /expected")).toBeVisible();
    expect(screen.queryByText("Ranking page differs from target")).not.toBeInTheDocument();
  });

  it("keeps differing URLs mismatched when position data is unavailable", () => {
    render(
      <KeywordMetricCards
        keyword={{
          ...keywordRows[0],
          hasRankData: false,
          position: 0,
          rankingUrl: "https://example.com/actual",
          targetUrl: "https://example.com/expected",
        }}
        keywordContext="full"
      />,
    );

    expect(screen.getByText("Target mismatch")).toBeVisible();
    expect(screen.queryByText("Matches target")).not.toBeInTheDocument();
  });

  it("hides Best for a one-check chart and makes a ranking URL a real new-tab link", () => {
    render(
      <KeywordMetricCards chartState="one_check" keyword={keywordRows[0]} keywordContext="full" />,
    );

    expect(screen.queryByText(/Best #/)).not.toBeInTheDocument();
    expect(screen.getByTitle("Open ranking URL in a new tab")).toHaveAttribute("target", "_blank");
  });

  it("uses completed checks for What changed and treats the footer as the current URL", () => {
    const keyword: KeywordRow = {
      ...keywordRows[0],
      position: 3,
      positionBaseline: 5,
      positionHistory: [
        { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 5 },
        { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
      ],
      rankingUrl: "https://example.com/rank-tracker",
      rankingUrlHistory: [
        {
          endAt: "2026-08-09T10:00:00.000Z",
          isCurrent: false,
          note: "First seen ranking",
          position: 5,
          requestedDepth: 20,
          startAt: "2026-08-09T10:00:00.000Z",
          url: "https://example.com/old",
        },
        {
          endAt: "2026-08-10T10:00:00.000Z",
          isCurrent: true,
          note: "Current",
          position: 3,
          requestedDepth: 20,
          startAt: "2026-08-10T10:00:00.000Z",
          url: "https://example.com/rank-tracker",
        },
      ],
    };

    const { rerender } = render(<KeywordMetricCards keyword={keyword} keywordContext="full" />);

    expect(screen.getByText("Position improved #5 → #3")).toBeInTheDocument();
    expect(screen.getByText("1 URL ranking")).toBeInTheDocument();

    rerender(
      <KeywordMetricCards keyword={{ ...keyword, rankingUrl: null }} keywordContext="full" />,
    );
    expect(screen.getByText("No URL ranking yet")).toBeInTheDocument();
  });

  it("explains when a completed check enters tracked results", () => {
    render(
      <KeywordMetricCards
        keyword={{
          ...keywordRows[0],
          completedComparableChecks: [
            {
              checkedAt: "2026-08-09T10:00:00.000Z",
              position: null,
              rankingUrl: "https://example.com/rank-tracker",
            },
            {
              checkedAt: "2026-08-10T10:00:00.000Z",
              position: 3,
              rankingUrl: "https://example.com/rank-tracker",
            },
          ],
          positionHistory: [
            { checkedAt: "2026-08-01T10:00:00.000Z", label: "Aug 1", position: 9 },
            { checkedAt: "2026-08-08T10:00:00.000Z", label: "Aug 8", position: 5 },
          ],
        }}
        keywordContext="full"
      />,
    );

    expect(screen.getByText("Position entered tracked results at #3")).toBeInTheDocument();
    expect(screen.queryByText("No position change")).not.toBeInTheDocument();
    expect(screen.queryByText("#0")).not.toBeInTheDocument();
    expect(screen.queryByText("-", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("Compared with the check from Aug 9")).toBeInTheDocument();
    expect(screen.queryByText("Compared with the check from Aug 1")).not.toBeInTheDocument();
  });

  it("renders the full, partial, and unavailable context vocabulary", () => {
    const { rerender } = render(
      <KeywordMetricCards keyword={keywordRows[0]} keywordContext="full" />,
    );

    expect(screen.getByText("CPC")).toBeInTheDocument();
    expect(screen.getByText("Difficulty")).toBeInTheDocument();

    rerender(
      <KeywordMetricCards
        keyword={{ ...keywordRows[0], cpcKnown: false, difficultyKnown: false }}
        keywordContext="partial"
      />,
    );
    expect(screen.getByText("Volume")).toBeInTheDocument();
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("CPC")).toBeInTheDocument();
    expect(screen.getByText("Difficulty")).toBeInTheDocument();
    expect(screen.getAllByText("n/a")).toHaveLength(2);

    rerender(
      <KeywordMetricCards keyword={{ ...keywordRows[0], hasTag: false }} keywordContext="full" />,
    );
    expect(screen.queryByText("Medium")).not.toBeInTheDocument();

    rerender(
      <KeywordMetricCards
        keyword={{
          ...keywordRows[0],
          cpcKnown: false,
          difficultyKnown: false,
          volumeKnown: false,
        }}
        keywordContext="unavailable"
      />,
    );
    expect(screen.getAllByText("n/a")).toHaveLength(3);
    expect(
      screen.getAllByTitle(
        "No search volume or difficulty data for this market - positions are tracked normally.",
      ),
    ).toHaveLength(3);
  });
});
