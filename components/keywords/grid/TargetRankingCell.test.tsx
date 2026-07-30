import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TargetRankingCell } from "./TargetRankingCell";

function row(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return { ...keywordRows[0], ...overrides } as KeywordRow;
}

describe("TargetRankingCell", () => {
  it("shows matching target and observed ranking URLs separately", () => {
    render(
      <TargetRankingCell row={row({ rankingUrl: "https://acme.dev/docs", targetUrl: "/docs" })} />,
    );

    const matchStatus = screen.getByText("Matches");
    expect(matchStatus).toHaveClass(
      "inline-flex",
      "h-5",
      "self-center",
      "items-center",
      "px-2",
      "text-[9.5px]",
      "leading-none",
    );
    expect(matchStatus.previousElementSibling).toHaveClass("grid", "flex-1");
    expect(screen.getByRole("link", { name: "/docs" })).toHaveAttribute(
      "href",
      "https://acme.dev/docs",
    );
    expect(screen.queryByRole("button", { name: /change target url/i })).not.toBeInTheDocument();
  });

  it("marks a different observed page as the wrong URL", () => {
    render(
      <TargetRankingCell row={row({ rankingUrl: "https://acme.dev/blog", targetUrl: "/docs" })} />,
    );

    expect(screen.getByText("Wrong URL")).toBeInTheDocument();
  });

  it("does not invent a ranking URL before the first check", () => {
    const pending = row({
      checkState: "never_checked",
      hasRankData: false,
      rankingPath: null,
      rankingUrl: null,
      targetUrl: null,
    });
    render(<TargetRankingCell row={pending} />);

    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set target url/i })).not.toBeInTheDocument();
  });
});
