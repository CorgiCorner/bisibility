import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordInlineEditTextField } from "./KeywordInlineEditTextField";

describe("KeywordInlineEditTextField", () => {
  it("retains its border over a sunken surface", () => {
    render(
      <div className="bg-bg-sunken">
        <KeywordInlineEditTextField label="Keyword" />
      </div>,
    );

    expect(screen.getByRole("textbox", { name: "Keyword" })).toHaveClass(
      "bg-transparent",
      "border-border-control",
    );
  });
});
