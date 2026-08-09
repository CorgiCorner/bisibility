import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordInlineEditTextField } from "./KeywordInlineEditTextField";
import { keywordGridSx } from "./keyword-data-grid-config";

describe("KeywordInlineEditTextField", () => {
  it("retains its border over the grid hover surface", () => {
    render(
      <div className="bg-bg-sunken">
        <KeywordInlineEditTextField label="Keyword" />
      </div>,
    );

    expect(screen.getByRole("textbox", { name: "Keyword" })).toHaveClass(
      "bg-transparent",
      "border-border-strong",
    );
    expect(keywordGridSx["& .MuiDataGrid-row:hover"]).toEqual({
      backgroundColor: "var(--bg-sunken)",
    });
  });
});
