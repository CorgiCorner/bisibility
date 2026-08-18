import { emptyRankCopy } from "@/components/keywords/KeywordPendingEmptyState";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordPendingModules } from "./KeywordPendingModules";

const copy = emptyRankCopy("never_checked", "prj_test", 20, true);

function pendingKeyword(): KeywordRow {
  return {
    ...keywordRows[0],
    checkState: "never_checked",
    hasRankData: false,
    position: 101,
    positionHistory: [],
    rankingUrl: null,
    rankingUrlHistory: [],
    tags: [],
    trackedDepth: 20,
  };
}

describe("KeywordPendingModules", () => {
  it("renders the three summary tiles and the position history chart", () => {
    render(<KeywordPendingModules copy={copy} keyword={pendingKeyword()} state="never_checked" />);

    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("Ranking URL")).toBeInTheDocument();
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Position history" })).toHaveLength(1);
  });

  it("gives small summary cards the semantic card radius without a redundant override", () => {
    render(<KeywordPendingModules copy={copy} keyword={pendingKeyword()} state="never_checked" />);

    const positionCard = screen.getByText("Position").closest(".rounded-card");
    expect(positionCard).not.toBeNull();
    expect(positionCard).toHaveClass("rounded-card");
    expect(positionCard).not.toHaveClass("rounded-" + "[14px]");
    expect(positionCard).toHaveStyle({ padding: "15px 16px" });
  });

  it("keeps the intentional 14px override on the large PendingChart card", () => {
    render(<KeywordPendingModules copy={copy} keyword={pendingKeyword()} state="never_checked" />);

    const chartCard = screen
      .getByRole("heading", { name: "Position history" })
      .closest(".MuiPaper-root");
    expect(chartCard).not.toBeNull();
    expect(chartCard).toHaveClass("rounded-card");
    expect(chartCard).not.toHaveClass("rounded-card-lg");
    expect(chartCard).toHaveStyle({ borderRadius: "14px" });
  });
});
