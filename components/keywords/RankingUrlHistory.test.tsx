import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import { deriveRankingUrlPeriods } from "@/lib/keyword-detail/ranking-url-history";
import { deriveKeywordDetailWhatChanged } from "@/lib/keyword-detail/state-model";
import type { KeywordRow, RankingUrlEvent } from "@/lib/queries/keywords";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

type UrlHistoryEventInput = RankingUrlEvent;

function event(input: Partial<UrlHistoryEventInput> = {}): UrlHistoryEventInput {
  return {
    endAt: "2026-06-18T08:00:00.000Z",
    isCurrent: true,
    note: "Current",
    position: 3,
    requestedDepth: 100,
    startAt: "2026-06-18T08:00:00.000Z",
    url: "https://example.com/headless-cms",
    ...input,
  };
}

function renderHistory(history: UrlHistoryEventInput[], trackedDepth = 100) {
  render(
    <RankingUrlHistory
      keyword={
        {
          ...keywordRows[0],
          rankingUrlHistory: history,
          trackedDepth,
        } as KeywordRow
      }
    />,
  );
}

describe("RankingUrlHistory", () => {
  it("keeps interactive tooltip markup inside a client boundary", () => {
    const historySource = readFileSync(
      resolve(process.cwd(), "components/keywords/RankingUrlHistory.tsx"),
      "utf8",
    );
    const linkSource = readFileSync(
      resolve(process.cwd(), "components/keywords/RankingUrlExternalLink.tsx"),
      "utf8",
    );

    expect(historySource).toContain("<RankingUrlExternalLink");
    expect(historySource).not.toMatch(/\bTooltip\b/u);
    expect(historySource).not.toMatch(/<a\b/u);
    expect(linkSource).toMatch(/^"use client";/u);
    expect(linkSource).toContain(
      '<Tooltip content="Open ranking URL in a new tab" semantics="description">',
    );
    expect(linkSource).toContain("<a");
    expect(linkSource).toContain("ArrowUpRightIcon as ArrowUpRight");
    expect(linkSource).toMatch(/<ArrowUpRight[^>]*size=\{12\}[^>]*weight="regular"/u);
  });

  it("counts only real URL changes in the design source sequence", () => {
    const designSourceNewestFirst = [
      event({ isCurrent: true, url: "/headless-cms" }),
      event({
        endAt: "2026-06-02T08:00:00.000Z",
        isCurrent: false,
        note: null,
        startAt: "2026-05-12T08:00:00.000Z",
        url: "/headless-cms",
      }),
      event({
        endAt: "2026-05-12T08:00:00.000Z",
        isCurrent: false,
        note: "URL switched",
        startAt: "2026-05-01T08:00:00.000Z",
        url: "/blog/headless-cms-guide",
      }),
      event({
        endAt: "2026-05-01T08:00:00.000Z",
        isCurrent: false,
        note: "First seen ranking",
        startAt: "2026-04-20T08:00:00.000Z",
        url: "/headless-cms",
      }),
    ];

    renderHistory([...designSourceNewestFirst].reverse());

    expect(screen.getByText("URL changed")).toBeInTheDocument();
    const explanation = screen.getByRole("button", {
      name: /A change means Google now ranks a different page of yours/,
    });
    expect(explanation).toBeInTheDocument();
    expect(explanation).toHaveAttribute("aria-describedby");
    const descId = explanation.getAttribute("aria-describedby");
    expect(document.getElementById(descId ?? "")).toHaveTextContent(
      "The rank shown for each period is the position recorded at that period's last check.",
    );
    expect(screen.getAllByRole("link")).not.toHaveLength(0);
    expect(screen.getByText("Current page")).toBeInTheDocument();
    expect(screen.getByText("First indexed for this query")).toBeInTheDocument();
    expect(screen.getByText("URL switched")).toBeInTheDocument();
  });

  it("uses a narrow-safe grid with dates inside the content column", () => {
    renderHistory([event()]);

    const period = screen.getByTestId("ranking-url-period");
    expect(period).toHaveClass("grid-cols-[18px_minmax(0,1fr)_auto]");
    expect(screen.getByText("Jun 18 - now")).toHaveClass("col-start-2", "row-start-1");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-describedby");
    expect(link).toHaveAttribute("href", "https://example.com/headless-cms");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(link).toHaveTextContent("/headless-cms");
    const icon = link.querySelector("svg");
    expect(icon).toHaveClass("ml-1", "inline-block");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("width", "12");
    expect(icon).toHaveAttribute("height", "12");
    // The grid item is the ancestor carrying the placement classes; Tooltip adds a wrap
    // between it and the link.
    expect(link.closest(".row-start-2")).toHaveClass("row-start-2", "sm:row-start-1");
  });

  it("does not present a closed newest period as current", () => {
    const history = deriveRankingUrlPeriods([
      {
        checkedAt: new Date("2026-04-20T08:00:00.000Z"),
        position: 11,
        rankingUrl: "https://example.com/headless-cms",
        status: "completed",
      },
      {
        checkedAt: new Date("2026-05-12T08:00:00.000Z"),
        position: 5,
        rankingUrl: "https://example.com/blog/headless-cms-guide",
        status: "completed",
      },
      {
        checkedAt: new Date("2026-06-02T08:00:00.000Z"),
        position: null,
        rankingUrl: null,
        status: "completed",
      },
    ]).map((period) => ({
      ...period,
      endAt: period.endAt.toISOString(),
      requestedDepth: 100,
      startAt: period.startAt.toISOString(),
    }));

    renderHistory(history);

    expect(screen.queryByText("Current")).not.toBeInTheDocument();
    expect(screen.getByText("May 12 - May 12")).toBeInTheDocument();
    expect(screen.queryByText(/- now/)).not.toBeInTheDocument();
  });

  it("uses the period depth instead of a newer failed attempt depth", () => {
    renderHistory(
      [
        event({
          endAt: "2026-05-12T08:00:00.000Z",
          isCurrent: false,
          note: "First seen ranking",
          position: 73,
          requestedDepth: 100,
          startAt: "2026-04-20T08:00:00.000Z",
        }),
      ],
      20,
    );

    expect(screen.getByText("#73")).toBeInTheDocument();
    expect(screen.queryByText("Not in top 20")).not.toBeInTheDocument();
  });

  it("uses the minus glyph for no change while retaining the current first-check period", () => {
    const { rerender } = render(
      <RankingUrlHistory
        keyword={
          {
            ...keywordRows[0],
            rankingUrlHistory: [event({ isCurrent: false }), event({ isCurrent: true })],
          } as KeywordRow
        }
      />,
    );

    expect(screen.getByText("No change").parentElement?.querySelector("svg")).not.toBeNull();

    rerender(
      <RankingUrlHistory
        keyword={{ ...keywordRows[0], rankingUrlHistory: [event()] } as KeywordRow}
      />,
    );

    expect(screen.getByRole("link")).toBeInTheDocument();
    expect(screen.getByText("Current page")).toBeInTheDocument();
    expect(screen.queryByText("No ranking URL observed yet")).not.toBeInTheDocument();
  });

  it("does not claim a URL switched when stable URLs carry a stale period note", () => {
    renderHistory(
      [
        event({ isCurrent: false, note: "First seen ranking" }),
        event({ isCurrent: false, note: "URL switched" }),
        event({ isCurrent: true, note: "Current" }),
      ],
      100,
    );

    expect(screen.queryByText("URL switched")).not.toBeInTheDocument();
  });

  it("does not badge a stable URL as changed for a position-only detail diff", () => {
    const keyword = {
      ...keywordRows[0],
      completedComparableChecks: [
        {
          checkedAt: "2026-08-09T10:00:00.000Z",
          position: 5,
          rankingUrl: "https://example.com/headless-cms",
        },
        {
          checkedAt: "2026-08-10T10:00:00.000Z",
          position: 3,
          rankingUrl: "https://example.com/headless-cms",
        },
      ],
      rankingUrlHistory: [event()],
    } as KeywordRow;

    expect(deriveKeywordDetailWhatChanged(keyword)).toBe("diff");
    render(<RankingUrlHistory keyword={keyword} />);

    expect(screen.queryByText("URL changed")).not.toBeInTheDocument();
  });
});
