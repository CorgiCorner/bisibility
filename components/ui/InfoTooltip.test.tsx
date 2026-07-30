import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InfoTooltip } from "./InfoTooltip";

describe("InfoTooltip", () => {
  it("shows its help text when the keyboard-focusable trigger receives focus", async () => {
    const user = userEvent.setup();
    const text = "How often ranks are checked automatically.";
    render(<InfoTooltip text={text} />);

    await user.tab();

    expect(screen.getByRole("button", { name: text })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(text);
  });
});
