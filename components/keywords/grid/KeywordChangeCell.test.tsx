import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordChangeCell } from "./KeywordChangeCell";

describe("KeywordChangeCell", () => {
  it("uses the earlier-day baseline instead of the immediately preceding check", () => {
    render(
      <KeywordChangeCell
        row={{ ...keywordRows[0], position: 6, positionBaseline: 4, previousPosition: 6 }}
      />,
    );

    expect(screen.getByLabelText("Down 2")).toHaveTextContent("2");
  });

  it("shows New when no earlier-day baseline exists", () => {
    render(
      <KeywordChangeCell
        row={{ ...keywordRows[0], position: 6, positionBaseline: null, previousPosition: 6 }}
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
});
