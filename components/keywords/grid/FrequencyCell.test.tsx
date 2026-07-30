import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrequencyCell } from "./FrequencyCell";

const row = keywordRows[0] as KeywordRow;

describe("FrequencyCell", () => {
  it("shows the effective frequency and whether it inherits the project default", () => {
    render(<FrequencyCell row={{ ...row, scheduleSource: "project" }} />);

    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("labels a keyword-specific schedule as custom", () => {
    render(
      <FrequencyCell
        row={{
          ...row,
          schedule: { ...row.schedule, frequency: "weekly" },
          scheduleSource: "keyword",
        }}
      />,
    );

    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toHaveClass(
      "inline-flex",
      "h-5",
      "self-center",
      "items-center",
      "px-2",
      "text-[9.5px]",
      "leading-none",
    );
  });
});
