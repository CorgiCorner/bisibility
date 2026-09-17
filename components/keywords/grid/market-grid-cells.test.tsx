import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keywords";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketDifficultyCell, MarketPositionCell, MarketVolumeCell } from "./market-grid-cells";

const row = keywordRows[0] as KeywordRow;

describe("market grid cells", () => {
  it("uses feature-owned labels for check state and unavailable market metrics", () => {
    const { rerender } = render(
      <MarketPositionCell row={{ ...row, checkState: "running", hasRankData: false }} />,
    );
    expect(screen.getByLabelText("Check running")).toBeInTheDocument();

    rerender(<MarketVolumeCell row={{ ...row, volumeKnown: false }} />);
    expect(
      screen.getByLabelText("No volume data for this market-language pair"),
    ).toBeInTheDocument();

    rerender(<MarketDifficultyCell row={{ ...row, difficultyKnown: false }} />);
    expect(screen.getByLabelText("No difficulty data")).toBeInTheDocument();
  });

  it("names an out-of-depth result with its numeric catalog argument", () => {
    render(
      <MarketPositionCell row={{ ...row, hasRankData: true, position: 101, trackedDepth: 50 }} />,
    );

    expect(screen.getByText("Not found in top 50")).toBeInTheDocument();
  });

  it("renders a ranked position through the feature catalog", () => {
    render(<MarketPositionCell row={{ ...row, hasRankData: true, position: 2 }} />);

    expect(screen.getByText("#2")).toBeInTheDocument();
  });
});
