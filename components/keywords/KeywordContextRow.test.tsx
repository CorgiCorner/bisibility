import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordContextRow } from "./KeywordContextRow";

describe("KeywordContextRow", () => {
  it("keeps a visible gap between the difficulty score and its tag", () => {
    render(
      <KeywordContextRow
        keyword={{ ...keywordRows[0], difficulty: 62, difficultyKnown: true, hasTag: true }}
        state="full"
      />,
    );

    expect(screen.getByText("Medium").parentElement).toHaveClass("gap-1");
  });
});
