import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChoiceGroup } from "./ChoiceGroup";

const options = [
  { value: "chat", label: "ChatGPT", description: "Model A" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini", disabledReason: "Temporarily unavailable" },
];
function Multiple() {
  const [value, onChange] = useState<string[]>([]);
  return (
    <ChoiceGroup
      mode="multiple"
      label="Engines"
      options={options}
      value={value}
      onChange={onChange}
      max={1}
      maxHint="Choose up to one engine"
    />
  );
}
describe("ChoiceGroup", () => {
  it("supports Space, preserves deselection at the limit and explains disabled choices", async () => {
    const user = userEvent.setup();
    render(<Multiple />);
    expect(screen.getByRole("group", { name: "Engines" })).toBeVisible();
    await user.tab();
    const chat = screen.getByRole("checkbox", { name: "ChatGPT" });
    expect(chat).toHaveFocus();
    await user.keyboard(" ");
    expect(chat).toBeChecked();
    const claude = screen.getByRole("checkbox", { name: "Claude" });
    expect(claude).toHaveAttribute("aria-disabled", "true");
    expect(claude).toHaveAccessibleDescription("Choose up to one engine");
    await user.click(claude);
    expect(claude).not.toBeChecked();
    await user.click(chat);
    expect(claude).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("checkbox", { name: "Gemini" })).toHaveAccessibleDescription(
      "Temporarily unavailable",
    );
  });
  it("uses radio semantics, Space and arrow navigation in single mode", async () => {
    const user = userEvent.setup();
    function Single() {
      const [value, onChange] = useState("chat");
      return (
        <ChoiceGroup
          mode="single"
          label="Engine"
          options={options}
          value={value}
          onChange={onChange}
        />
      );
    }
    render(<Single />);
    expect(screen.getByRole("radiogroup", { name: "Engine" })).toBeVisible();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Claude" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Claude" })).toBeChecked();
    await user.keyboard(" ");
    expect(screen.getByRole("radio", { name: "Claude" })).toBeChecked();
  });
  it("keeps disabled choices focusable to read the reason without changing selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceGroup
        mode="multiple"
        label="Engines"
        options={options}
        value={[]}
        onChange={onChange}
        disabled
      />,
    );
    await user.tab();
    await user.keyboard(" ");
    expect(onChange).not.toHaveBeenCalled();
  });
});
