import { KeywordsPasteInput } from "@/components/keywords/blocks/KeywordsPasteInput";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

describe("KeywordsPasteInput", () => {
  it("parses keywords and optional URLs while reporting a live valid-row count", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const count = vi.fn();
    function TestInput() {
      const [value, setValue] = useState("");
      return (
        <KeywordsPasteInput
          count={count}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          value={value}
        />
      );
    }
    render(<TestInput />);

    await user.type(
      screen.getByRole("textbox", { name: "Keywords" }),
      "rank tracking | https://example.com/rank\nseo tools",
    );
    expect(screen.getByText(/2 valid keywords/)).toBeVisible();
    expect(count).toHaveBeenLastCalledWith(2);
  });

  it("exposes duplicate and malformed lines through stable descriptions", () => {
    render(
      <KeywordsPasteInput
        count={vi.fn()}
        onChange={vi.fn()}
        value={"rank tracking | not a url\nRANK TRACKING"}
      />,
    );

    expect(screen.getByText(/not a valid URL or path/)).toHaveAttribute(
      "id",
      "keywords-paste-error-1",
    );
    expect(screen.getByText(/Duplicate keyword/)).toHaveAttribute("id", "keywords-paste-error-2");
    expect(screen.getByRole("textbox", { name: "Keywords" })).toHaveAttribute(
      "aria-describedby",
      "keywords-paste-error-1 keywords-paste-error-2",
    );
  });

  it("preserves source line numbers when blank lines separate errors", () => {
    render(
      <KeywordsPasteInput
        count={vi.fn()}
        onChange={vi.fn()}
        value={"\nrank tracking | not a url\n\nseo tools | also not a url"}
      />,
    );

    expect(screen.getByText('Line 2: "not a url" is not a valid URL or path.')).toHaveAttribute(
      "id",
      "keywords-paste-error-2",
    );
    expect(
      screen.getByText('Line 4: "also not a url" is not a valid URL or path.'),
    ).toHaveAttribute("id", "keywords-paste-error-4");
    expect(screen.getByRole("textbox", { name: "Keywords" })).toHaveAttribute(
      "aria-describedby",
      "keywords-paste-error-2 keywords-paste-error-4",
    );
  });
});
