import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordMetricCards } from "./KeywordMetricCards";

describe("KeywordMetricCards", () => {
  it("labels the position KPI as new without a previous observation", () => {
    const keyword: KeywordRow = { ...keywordRows[0], positionBaseline: null };

    render(<KeywordMetricCards keyword={keyword} />);

    expect(screen.getByText("New")).toHaveAttribute("aria-label", "First observation");
    expect(screen.queryByLabelText("No change")).not.toBeInTheDocument();
  });

  it("compares the current position with the earlier-day chart baseline", () => {
    const keyword: KeywordRow = {
      ...keywordRows[0],
      position: 6,
      positionBaseline: 4,
      previousPosition: 6,
    };

    render(<KeywordMetricCards keyword={keyword} />);

    expect(screen.getByLabelText("Down 2")).toHaveTextContent("2");
    expect(screen.queryByLabelText("No change")).not.toBeInTheDocument();
  });

  it("shows missing difficulty once", () => {
    const keyword: KeywordRow = {
      ...keywordRows[0],
      cpcKnown: false,
      difficultyKnown: false,
      volumeKnown: false,
    };

    render(<KeywordMetricCards keyword={keyword} />);

    expect(screen.getAllByText("No data")).toHaveLength(3);
  });
});
