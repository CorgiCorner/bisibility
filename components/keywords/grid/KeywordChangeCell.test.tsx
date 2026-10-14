import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordChangeCell } from "./KeywordChangeCell";
import { rankPoint, rankQualityRow } from "./keyword-rank-quality.test-fixture";

describe("KeywordChangeCell", () => {
  it("uses the earlier-day baseline instead of the immediately preceding check", () => {
    const row = rankQualityRow();
    row.rankQuality.baseline = rankPoint({ position: 4 });
    row.rankQuality.movement = -2;
    render(
      <KeywordChangeCell row={{ ...row, position: 6, positionBaseline: 4, previousPosition: 6 }} />,
    );

    expect(screen.getByLabelText("Down 2")).toHaveTextContent("2");
  });

  it("shows New when no earlier-day baseline exists", () => {
    const row = rankQualityRow();
    row.rankQuality = {
      ...row.rankQuality,
      baseline: null,
      comparison: "unavailable",
      event: "first",
      movement: null,
    };
    render(
      <KeywordChangeCell
        row={{ ...row, position: 6, positionBaseline: null, previousPosition: 6 }}
      />,
    );

    expect(screen.getByLabelText("First observation")).toHaveTextContent("New");
    expect(screen.getByLabelText("First observation")).toHaveClass(
      "inline-flex",
      "h-auto",
      "self-center",
      "border",
      "px-2.5",
      "py-1",
      "text-[11px]",
    );
  });
  it("does not label a legacy missing baseline as a first observation", () => {
    render(<KeywordChangeCell row={{ ...keywordRows[0], positionBaseline: null }} />);
    expect(screen.queryByLabelText("First observation")).not.toBeInTheDocument();
    expect(screen.getByLabelText("No comparable baseline")).toHaveTextContent("-");
  });
});
