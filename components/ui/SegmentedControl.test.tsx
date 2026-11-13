import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";
import { revealTab, Tabs } from "./Tabs";

type Mode = "a" | "b";

const options = [
  { label: "A", value: "a" },
  { label: "B", value: "b" },
] as const;

describe("SegmentedControl", () => {
  it("shows a stable busy affordance and disables its options while loading", () => {
    render(
      <SegmentedControl<Mode>
        loading
        name="loading"
        onChange={() => {}}
        options={options}
        size="xs"
        value="a"
      />,
    );

    const control = screen.getByRole("group");
    expect(control).toHaveAttribute("aria-busy", "true");
    expect(control.querySelector("[data-spinner]")).toBeInTheDocument();
    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
  });

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

    expect(screen.getByRole("group")).toHaveClass("m-0", "min-w-0", "p-0");
    expect(screen.getByRole("group").firstElementChild).toHaveClass("min-h-10", "max-sm:min-h-11");
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
    expect(span).toHaveClass("h-[26px]", "w-full", "bg-bg-sunken", "border-border");
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

  it("frames the extra-small track and uses a softer selected-option border", () => {
    render(
      <SegmentedControl<Mode>
        name="xs-fill"
        onChange={() => {}}
        options={options}
        size="xs"
        value="a"
      />,
    );

    const radio = screen.getByRole("radio", { name: "A" });
    const span = radio.nextElementSibling;
    const track = radio.parentElement?.parentElement;

    expect(track).toHaveClass("border", "border-border-control");
    expect(span).toHaveClass("bg-bg-sunken", "border-border");
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

function TabHarness() {
  const [value, setValue] = useState("overview");
  return (
    <Tabs
      ariaLabel="Sections"
      onChange={setValue}
      options={[
        { label: "Overview", value: "overview" },
        { label: "Activity", value: "activity" },
      ]}
      panelId="project-panel"
      value={value}
    />
  );
}

it("scrolls nowrap tabs inside a strip that cannot widen the page", () => {
  render(<TabHarness />);
  const strip = screen.getByRole("tablist");
  expect(strip).toHaveAttribute("data-tab-strip");
  expect(strip.className).toContain("min-w-0");
  expect(strip.className).toContain("overflow-x-auto");
  expect(strip.className).not.toContain("pb-px");
  const track = strip.querySelector("[data-tab-track]");
  expect(track?.parentElement).toBe(strip);
  expect(track?.className).toContain("min-w-full");
  expect(track?.className).toContain("border-b");
  for (const tab of screen.getAllByRole("tab")) {
    expect(tab.className).toContain("whitespace-nowrap");
    expect(tab.className).toContain("-mb-px");
  }
});

it("scrolls the strip when the active tab sits outside it", () => {
  const strip = document.createElement("div");
  strip.setAttribute("data-tab-strip", "");
  const tab = document.createElement("button");
  strip.append(tab);
  document.body.append(strip);
  strip.getBoundingClientRect = () =>
    ({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  tab.getBoundingClientRect = () =>
    ({
      bottom: 20,
      height: 20,
      left: 140,
      right: 200,
      top: 0,
      width: 60,
      x: 140,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  strip.scrollLeft = 0;
  revealTab(tab);
  expect(strip.scrollLeft).toBe(100);
  strip.remove();
});
