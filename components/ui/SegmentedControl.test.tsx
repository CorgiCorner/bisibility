import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

type Mode = "a" | "b";

const options = [
  { label: "A", value: "a" },
  { label: "B", value: "b" },
] as const;

describe("SegmentedControl", () => {
  it("stretches the option span to fill the field-size label by default", () => {
    render(
      <SegmentedControl<Mode>
        name="stretch"
        onChange={() => {}}
        options={options}
        size="field"
        value="a"
      />,
    );

    const radio = screen.getByRole("radio", { name: "A" });
    const label = radio.parentElement;
    const span = radio.nextElementSibling;

    expect(label).toHaveClass("flex");
    expect(span).toHaveClass("w-full");
  });

  it("does not top-align the option span when a consumer sets a smaller min-height", () => {
    render(
      <SegmentedControl<Mode>
        name="override"
        onChange={() => {}}
        optionClassName="min-h-7"
        options={options}
        size="field"
        value="a"
      />,
    );

    const radio = screen.getByRole("radio", { name: "A" });
    const label = radio.parentElement;
    const span = radio.nextElementSibling;

    expect(label).toHaveClass("flex");
    expect(span).toHaveClass("w-full", "min-h-7");
    expect(span).not.toHaveClass("self-start", "items-start");
  });

  it("preserves the fixed height of toolbar-size options", () => {
    render(
      <SegmentedControl<Mode>
        name="toolbar"
        onChange={() => {}}
        options={options}
        size="toolbar"
        value="a"
      />,
    );

    const span = screen.getByRole("radio", { name: "A" }).nextElementSibling;
    expect(span).toHaveClass("h-[26px]", "w-full");
  });

  it("preserves the fixed height of xs-size options", () => {
    render(
      <SegmentedControl<Mode>
        name="xs"
        onChange={() => {}}
        options={options}
        size="xs"
        value="a"
      />,
    );

    const span = screen.getByRole("radio", { name: "A" }).nextElementSibling;
    expect(span).toHaveClass("h-6", "w-full");
  });

  it("preserves native radio semantics and keyboard navigation", () => {
    render(
      <SegmentedControl<Mode>
        name="keyboard"
        onChange={() => {}}
        options={options}
        size="field"
        value="a"
      />,
    );

    const a = screen.getByRole("radio", { name: "A" });
    const b = screen.getByRole("radio", { name: "B" });

    expect(a).toBeChecked();
    expect(b).not.toBeChecked();
    expect(a).toHaveAttribute("type", "radio");
    expect(b).toHaveAttribute("type", "radio");
    expect(a).toHaveAttribute("name", "keyboard");
    expect(b).toHaveAttribute("name", "keyboard");
  });
});
