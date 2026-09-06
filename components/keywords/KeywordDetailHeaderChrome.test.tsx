import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";

describe("KeywordDetailHeaderChrome", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses a compact ID, without a Keyword eyebrow, while retaining the full ID for copy", () => {
    const keyword = { ...keywordRows[0], id: "kw_3f9a2c1d7e" };
    render(<KeywordDetailHeaderChrome actions={null} keyword={keyword} timeZone="UTC" />);

    expect(screen.queryByText("Keyword", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("kw_3f9a2c1").parentElement).toHaveAttribute("title", keyword.id);
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeInTheDocument();
  });

  it("renders two responsive four-up rows with Competition instead of Intent", () => {
    render(<KeywordDetailHeaderChrome actions={null} keyword={keywordRows[0]} timeZone="UTC" />);

    const metadata = screen.getByLabelText("Keyword check metadata");
    expect(metadata).toHaveClass("sm:grid-cols-2", "xl:grid-cols-4");
    expect(metadata.querySelectorAll('[data-testid="keyword-detail-slot"]')).toHaveLength(8);
    expect(screen.getByText("Competition", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Intent", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByTestId("keyword-detail-slot-value-position")).toHaveClass(
      "text-[17px]",
      "font-semibold",
    );
  });

  it("uses a CheckSchedule name for scheduled targets and Manual for unassigned ones", () => {
    const { rerender } = render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{
          ...keywordRows[0],
          checkSchedule: { name: "Daily 06:00", nextCheckAt: null, publicId: "sch_daily" },
        }}
        onChangeSchedule={vi.fn()}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("Daily 06:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "change" })).toBeInTheDocument();

    rerender(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{ ...keywordRows[0], checkSchedule: null }}
        onChangeSchedule={vi.fn()}
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "set schedule" })).toBeInTheDocument();
  });

  it("uses a quiet textual position state with its depth in the detail", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{ ...keywordRows[0], createdAt: "2026-09-03T00:00:00.000Z", projectSerpDepth: 50 }}
        rankState="not_ranked"
        timeZone="UTC"
      />,
    );

    const value = screen.getByTestId("keyword-detail-slot-value-position");
    expect(value).toHaveTextContent("Not ranked");
    expect(value).toHaveClass("text-[13px]", "text-fg-muted");
    expect(value).not.toHaveClass("text-[17px]", "font-semibold");
    expect(screen.getByText("Not in top 50 · Tracked since 3 Sept")).toBeInTheDocument();
  });

  it("uses a quiet textual position state when ranking data is unavailable", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{ ...keywordRows[0], hasRankData: false }}
        timeZone="UTC"
      />,
    );

    const value = screen.getByTestId("keyword-detail-slot-value-position");
    expect(value).toHaveTextContent("No data");
    expect(value).toHaveClass("text-[13px]", "text-fg-muted");
  });

  it("keeps a single empty ranking URL message and puts View SERP in its target detail", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{ ...keywordRows[0], rankingUrl: null, targetUrl: "/self-host" }}
        timeZone="UTC"
      />,
    );

    expect(screen.getAllByText("No ranking URL yet")).toHaveLength(1);
    expect(screen.getByTestId("keyword-detail-slot-value-ranking-url")).toHaveClass(
      "text-[13px]",
      "text-fg-muted",
    );
    expect(screen.getByText(/Target \/self-host/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View SERP" })).toBeInTheDocument();
  });

  it("maps clean topic tags but leaves an ambiguous High intent tag unprefixed", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{
          ...keywordRows[0],
          intent: null,
          tags: ["Product", "High intent"],
          topic: null,
        }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("Topic: Product")).toBeInTheDocument();
    expect(screen.getByText("High intent")).toBeInTheDocument();
    expect(screen.queryByText("Intent: High intent")).not.toBeInTheDocument();
  });

  it("shows unavailable metric guidance once below the second slot row", () => {
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{ ...keywordRows[0], cpcKnown: false, difficultyKnown: false, volumeKnown: false }}
        timeZone="UTC"
      />,
    );

    expect(screen.getAllByText("n/a")).toHaveLength(4);
    expect(
      screen.getAllByText(
        "No search volume or difficulty data for this market - positions are tracked normally.",
      ),
    ).toHaveLength(1);
  });

  it("uses catalog labels and hides or shows the GSC index footer", () => {
    const keyword = {
      ...keywordRows[0],
      dataProvider: "serpapi",
      urlPresence: {
        canonicalOk: true,
        checkedAt: "2026-09-03T00:00:00.000Z",
        coverageState: "Submitted and indexed",
        indexed: true,
        lastCrawlAt: "2026-09-02T00:00:00.000Z",
        url: "https://example.com/page",
        verdict: "PASS",
      },
    };
    const { rerender } = render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={keyword}
        providerLabel="SerpApi"
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("via SerpApi")).toBeInTheDocument();
    expect(screen.queryByText("Index status", { exact: true })).not.toBeInTheDocument();

    rerender(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={keyword}
        providerLabel="SerpApi"
        searchConsoleConnected
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("Index status", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Last inspected", { exact: true })).toBeInTheDocument();
  });

  it("omits the current year in older last-check timestamps", () => {
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
    render(
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={{ ...keywordRows[0], lastCheckAt: "2026-08-09T01:30:00.000Z" }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText(/9 Aug, \d{2}:30/)).toBeInTheDocument();
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });
});
