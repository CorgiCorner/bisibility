import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keywords";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rankQualityRow } from "./keyword-rank-quality.test-fixture";
import { TargetRankingCell } from "./TargetRankingCell";

function row(overrides: Partial<KeywordRow> = {}): KeywordRow {
  if (overrides.hasRankData === false || overrides.expectedUrlFallbackCurrent)
    return { ...keywordRows[0], ...overrides } as KeywordRow;
  const result = { ...rankQualityRow(), ...overrides };
  const current = result.rankQuality.current;
  if (!current) throw new Error("Fixture requires current evidence");
  result.rankQuality = {
    ...result.rankQuality,
    current: { ...current, rankingUrl: result.rankingUrl },
  };
  return result;
}

describe("TargetRankingCell", () => {
  it("shows matching target and observed ranking URLs separately", () => {
    render(
      <TargetRankingCell
        row={row({ expectedUrl: "/docs", rankingUrl: "https://acme.dev/docs", targetUrl: "/docs" })}
      />,
    );

    const matchStatus = screen.getByText("Matches");
    expect(matchStatus).toHaveClass(
      "inline-flex",
      "items-center",
      "rounded-full",
      "border",
      "bg-bg-sunken",
      "font-semibold",
    );
    expect(matchStatus.parentElement?.parentElement).toHaveClass("shrink-0", "self-center");
    expect(matchStatus.parentElement?.parentElement?.previousElementSibling).toHaveClass(
      "grid",
      "flex-1",
    );
    expect(screen.getByRole("link", { name: "/docs" })).toHaveAttribute(
      "href",
      "https://acme.dev/docs",
    );
    expect(screen.queryByRole("button", { name: /change target url/i })).not.toBeInTheDocument();
  });

  it("marks a different observed page as the wrong URL", () => {
    render(
      <TargetRankingCell
        row={row({ expectedUrl: "/docs", rankingUrl: "https://acme.dev/blog", targetUrl: "/docs" })}
      />,
    );

    expect(screen.getByText("Wrong URL")).toBeInTheDocument();
  });

  it("judges a historical ranking against its recorded expected URL", () => {
    render(
      <TargetRankingCell
        row={row({
          expectedUrl: "/docs",
          expectedUrlFallbackCurrent: false,
          expectedUrlSource: "explicit",
          rankingUrl: "https://acme.dev/docs",
          targetUrl: "/new-target",
        })}
      />,
    );

    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(screen.getByText("Expected for this market: /docs")).toBeInTheDocument();
  });

  it("states when a legacy check uses the current target URL and does not invent one", () => {
    const { rerender } = render(
      <TargetRankingCell
        row={row({
          expectedUrl: "/docs",
          expectedUrlFallbackCurrent: true,
          rankingUrl: "https://acme.dev/docs",
        })}
      />,
    );
    expect(screen.getByText("judged against the current target URL")).toBeInTheDocument();

    rerender(<TargetRankingCell row={row({ expectedUrl: null, targetUrl: null })} />);
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("does not invent a ranking URL before the first check", () => {
    const pending = row({
      checkState: "never_checked",
      hasRankData: false,
      expectedUrl: null,
      rankingPath: null,
      rankingUrl: null,
      targetUrl: null,
    });
    render(<TargetRankingCell row={pending} />);

    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set target url/i })).not.toBeInTheDocument();
  });
  it("preserves a retained URL without claiming Matches for an unqualified current row", () => {
    render(
      <TargetRankingCell
        row={{ ...keywordRows[0], expectedUrl: "/docs", rankingUrl: "https://acme.dev/docs" }}
      />,
    );
    expect(screen.queryByText("Matches")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/docs" })).toHaveAttribute(
      "href",
      "https://acme.dev/docs",
    );
    expect(screen.getByText("Last known URL. Current result unavailable.")).toBeInTheDocument();
  });
  it("keeps current-target fallback visible without presenting it as captured expectation", () => {
    render(
      <TargetRankingCell
        row={row({
          expectedUrl: "/docs",
          expectedUrlFallbackCurrent: true,
          expectedUrlSource: "explicit",
          rankingUrl: "https://acme.dev/docs",
        })}
      />,
    );
    const marker = screen.getByText("judged against the current target URL");
    expect(marker).not.toHaveClass("sr-only");
    expect(marker.closest(".sr-only")).toBeNull();
  });

  it("makes retained ranking provenance visible and preserves unavailable current match", () => {
    render(
      <TargetRankingCell
        row={{ ...keywordRows[0], expectedUrl: "/docs", rankingUrl: "https://acme.dev/docs" }}
      />,
    );
    const marker = screen.getByText("Last known URL. Current result unavailable.");
    expect(marker).not.toHaveClass("sr-only");
    expect(marker.closest(".sr-only")).toBeNull();
    expect(screen.queryByText("Matches")).not.toBeInTheDocument();
  });

  it("does not pass today's expectation-source enum off as the recorded source", () => {
    render(
      <TargetRankingCell
        row={row({
          expectedUrl: "/docs",
          expectedUrlSource: "hreflang",
          expectedUrlFallbackCurrent: false,
          rankingUrl: "https://acme.dev/docs",
          targetUrl: "/edited",
        })}
      />,
    );
    expect(screen.queryByText(/\(hreflang\)/)).not.toBeInTheDocument();
    expect(screen.getByText("Expected URL captured with this measurement")).not.toHaveClass(
      "sr-only",
    );
  });
});
