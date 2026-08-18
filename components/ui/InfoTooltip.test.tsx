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

  it("has a 24px hit target with a 12px icon", () => {
    const text = "Help text.";
    render(<InfoTooltip text={text} />);

    const button = screen.getByRole("button", { name: text });
    expect(button).toHaveClass("h-6", "w-6");
    const icon = button.querySelector("svg");
    expect(icon).toHaveAttribute("width", "12");
  });

  it("does not use a native title attribute", () => {
    const text = "Help text.";
    render(<InfoTooltip text={text} />);

    expect(screen.getByRole("button", { name: text })).not.toHaveAttribute("title");
  });

  it("exposes the help text as an aria-describedby description without changing the accessible name", () => {
    const text = "Help text for the field.";
    render(<InfoTooltip text={text} />);

    const button = screen.getByRole("button", { name: text });
    expect(button).toHaveAttribute("aria-describedby");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const desc = document.getElementById(describedBy ?? "");
    expect(desc).toHaveTextContent(text);
    expect(button).not.toHaveAttribute("aria-labelledby");
  });
});
