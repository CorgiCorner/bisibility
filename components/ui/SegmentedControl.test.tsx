import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("does not put a native title on the label or input when a tooltip is supplied", () => {
    render(
      <SegmentedControl<Mode>
        name="tooltip"
        onChange={() => {}}
        options={[
          { label: "A", tooltip: "Reason A", value: "a" },
          { label: "B", tooltip: "Reason B", value: "b" },
        ]}
        size="field"
        value="a"
      />,
    );

    for (const name of ["A", "B"]) {
      const radio = screen.getByRole("radio", { name });
      expect(radio).not.toHaveAttribute("title");
      expect(radio.closest("label")).not.toHaveAttribute("title");
    }
  });

  it("shows the tooltip text on focus as a description, not a replacement name", async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl<Mode>
        name="tooltip-focus"
        onChange={() => {}}
        options={[
          { label: "A", tooltip: "Reason for A", value: "a" },
          { label: "B", value: "b" },
        ]}
        size="field"
        value="a"
      />,
    );

    const radio = screen.getByRole("radio", { name: "A" });
    await user.tab();
    expect(radio).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Reason for A");
    expect(screen.getByRole("radio", { name: "A" })).toBe(radio);
  });

  it("exposes a disabled option reason via aria-describedby on the radio without making it selectable", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl<Mode>
        name="disabled-reason"
        onChange={onChange}
        options={[
          { label: "A", value: "a" },
          { label: "B", disabled: true, tooltip: "B is unavailable", value: "b" },
        ]}
        size="field"
        value="a"
      />,
    );

    const disabledRadio = screen.getByRole("radio", { name: "B" });
    expect(disabledRadio).toBeDisabled();
    expect(disabledRadio).not.toHaveAttribute("title");
    expect(disabledRadio).toHaveAttribute("aria-describedby");
    const describedBy = disabledRadio.getAttribute("aria-describedby");
    const desc = document.getElementById(describedBy ?? "");
    expect(desc).toHaveTextContent("B is unavailable");
  });

  it("opens the visual house tooltip on hover of a disabled option without selecting it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl<Mode>
        name="disabled-hover"
        onChange={onChange}
        options={[
          { label: "A", value: "a" },
          { label: "B", disabled: true, tooltip: "B is unavailable", value: "b" },
        ]}
        size="field"
        value="a"
      />,
    );

    const disabledRadio = screen.getByRole("radio", { name: "B" });
    expect(disabledRadio).toBeDisabled();
    const visualSurface = disabledRadio.closest("label");
    expect(visualSurface).not.toBeNull();
    await user.hover(visualSurface as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("B is unavailable");
    expect(onChange).not.toHaveBeenCalled();
  });
});
