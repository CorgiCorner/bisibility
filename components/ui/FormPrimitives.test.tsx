import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Kbd } from "./Kbd";
import { Pill } from "./Pill";
import { SegmentedControl } from "./SegmentedControl";
import { Switch } from "./Switch";
import { Textarea } from "./Textarea";

type Frequency = "daily" | "manual" | "weekly";

function SegmentedHarness({
  disabled = false,
  size,
}: {
  disabled?: boolean;
  size?: "default" | "toolbar" | "xs";
}) {
  const [value, setValue] = useState<Frequency>("daily");

  return (
    <>
      <SegmentedControl
        disabled={disabled}
        label="Frequency"
        name="frequency"
        onChange={setValue}
        options={[
          { label: "Daily", value: "daily" },
          { label: "Weekly", value: "weekly" },
          { label: "Manual", value: "manual" },
        ]}
        size={size}
        value={value}
      />
      <output>{value}</output>
    </>
  );
}

describe("form primitives", () => {
  it("renders keyboard hints as semantic keycaps", () => {
    render(
      <Kbd>
        <span aria-hidden>↵</span>
        <span className="sr-only">Enter</span>
      </Kbd>,
    );

    const keycap = screen.getByText("↵").closest("kbd");
    expect(keycap).not.toBeNull();
    expect(keycap?.tagName).toBe("KBD");
    expect(keycap).toHaveTextContent("↵Enter");
    expect(screen.getByText("Enter")).toHaveClass("sr-only");
  });

  it("renders and toggles a native checkbox", () => {
    render(<Checkbox label="All subdomains" name="includeSubdomains" />);

    const checkbox = screen.getByRole("checkbox", { name: "All subdomains" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveClass("col-start-1", "row-start-1", "m-0");
    expect(checkbox.nextElementSibling).toHaveClass("col-start-1", "row-start-1");
    expect(checkbox.parentElement).toHaveClass("place-items-center");
    expect(checkbox.parentElement).not.toHaveClass("mt-0.5");
    expect(checkbox.nextElementSibling).not.toHaveClass(
      "absolute",
      "left-1/2",
      "top-1/2",
      "-translate-x-1/2",
      "-translate-y-1/2",
    );
  });

  it("keeps disabled checkboxes unchanged", () => {
    render(<Checkbox disabled label="URL prefix only" />);

    const checkbox = screen.getByRole("checkbox", { name: "URL prefix only" });

    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it("renders and toggles a switch using checkbox semantics", () => {
    render(<Switch label="Paused" name="isPaused" />);

    const toggle = screen.getByRole("switch", { name: "Paused" });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("keeps the small switch thumb inside the 32 by 18 track in both states", () => {
    render(<Switch label="Small switch" name="smallSwitch" />);

    const toggle = screen.getByRole("switch", { name: "Small switch" });
    const visual = toggle.parentElement;
    const thumb = visual?.lastElementChild;
    const track = { height: 18, width: 32 };
    const thumbGeometry = { diameter: 12, offX: 3, onX: 17, y: 3 };

    expect(visual).toHaveClass("h-[18px]", "w-8");
    expect(thumb).toHaveClass("left-[3px]", "top-[3px]", "h-3", "w-3");
    expect(thumb?.className).toContain("peer-checked:translate-x-3.5");

    for (const x of [thumbGeometry.offX, thumbGeometry.onX]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(thumbGeometry.y).toBeGreaterThanOrEqual(0);
      expect(x + thumbGeometry.diameter).toBeLessThanOrEqual(track.width);
      expect(thumbGeometry.y + thumbGeometry.diameter).toBeLessThanOrEqual(track.height);
    }
  });

  it("keeps disabled switches unchanged", () => {
    render(<Switch disabled label="Locked" />);

    const toggle = screen.getByRole("switch", { name: "Locked" });

    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
  });

  it("applies motion-token duration with reduced-motion reset only on the thumb", () => {
    render(<Switch label="Mo" name="mo" />);
    const v = screen.getByRole("switch", { name: "Mo" }).parentElement;
    const [t, th] = [v?.children[1], v?.lastElementChild];
    expect(t).toHaveClass("transition-colors", "duration-[var(--motion-tooltip)]", "ease-[ease]");
    expect(t?.className).not.toContain("motion-reduce");
    expect(th?.className).toMatch(
      /transition-transform.*duration-\[var\(--motion-tooltip\)\].*ease-\[var\(--ease-in-out\)\].*motion-reduce:transition-none/,
    );
  });

  it("changes segmented values by click and keyboard", () => {
    render(<SegmentedHarness />);

    const daily = screen.getByRole("radio", { name: "Daily" });
    const weekly = screen.getByRole("radio", { name: "Weekly" });

    expect(daily.nextElementSibling).toHaveClass("bg-nav-active");
    expect(weekly.nextElementSibling).toHaveClass("hover:bg-nav-active");

    fireEvent.click(weekly);
    expect(weekly).toBeChecked();
    expect(screen.getByText("weekly")).toBeInTheDocument();

    weekly.focus();
    fireEvent.keyDown(weekly, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();

    daily.focus();
    fireEvent.keyDown(daily, { key: "Enter" });
    expect(daily).toBeChecked();
  });

  it("uses the unified active treatment at the select-sized toolbar variant", () => {
    render(<SegmentedHarness size="toolbar" />);

    const daily = screen.getByRole("radio", { name: "Daily" });
    expect(daily.parentElement?.parentElement).toHaveClass(
      "min-h-[34px]",
      "bg-transparent",
      "text-[12.5px]",
    );
    expect(daily.nextElementSibling).toHaveClass(
      "h-[26px]",
      "bg-nav-active",
      "border-border-strong",
      "text-fg",
    );
    expect(daily.nextElementSibling?.className).not.toContain("shadow-");
    expect(daily.nextElementSibling?.className).not.toContain("bg-accent");
  });

  it("aligns extra-small segmented controls with extra-small buttons", () => {
    render(
      <>
        <SegmentedHarness size="xs" />
        <Button size="xs">Export</Button>
      </>,
    );

    const daily = screen.getByRole("radio", { name: "Daily" });
    expect(daily.parentElement?.parentElement).toHaveClass("min-h-[30px]");
    expect(screen.getByRole("button", { name: "Export" })).toHaveStyle({
      minHeight: "30px",
    });
  });

  it("disables segmented controls as a group", () => {
    render(<SegmentedHarness disabled />);

    const weekly = screen.getByRole("radio", { name: "Weekly" });
    fireEvent.click(weekly);

    expect(weekly).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Daily" })).toBeChecked();
  });

  it("ignores the deprecated activeVariant prop and uses one canonical active style", () => {
    const CANONICAL = ["border-border-strong", "bg-nav-active", "text-fg"];

    function VariantHarness({ activeVariant }: { activeVariant: "accent" | "neutral" }) {
      const [value, setValue] = useState<Frequency>("daily");
      return (
        <SegmentedControl
          activeVariant={activeVariant}
          label="Frequency"
          name="frequency"
          onChange={setValue}
          options={[
            { label: "Daily", value: "daily" },
            { label: "Weekly", value: "weekly" },
          ]}
          value={value}
        />
      );
    }

    const { rerender } = render(<VariantHarness activeVariant="neutral" />);
    const neutralActive = screen.getByRole("radio", { name: "Daily" }).nextElementSibling;
    expect(neutralActive).toHaveClass(...CANONICAL);
    expect(neutralActive?.className).not.toContain("bg-accent");
    const neutralClassName = neutralActive?.className;

    rerender(<VariantHarness activeVariant="accent" />);
    const accentActive = screen.getByRole("radio", { name: "Daily" }).nextElementSibling;
    expect(accentActive).toHaveClass(...CANONICAL);
    expect(accentActive?.className).not.toContain("bg-accent");
    expect(accentActive?.className).not.toContain("border-accent");
    expect(accentActive?.className).toBe(neutralClassName);
  });

  it("disables and dims buttons without repainting their variant while loading", () => {
    render(
      <Button loading loadingLabel="Saving" variant="secondary">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveStyle({
      color: "var(--fg-muted)",
      opacity: "0.65",
    });
  });

  it("uses the theme contrast foreground for primary links at the default 36px height", () => {
    render(<Button href="/connect">Connect free</Button>);

    const link = screen.getByRole("link", { name: "Connect free" });
    expect(link).toHaveClass("MuiButton-sizeMedium");
    expect(link).toHaveStyle({ color: "var(--mui-palette-primary-contrasttext)" });
  });

  it("forwards download attributes to link buttons", () => {
    render(
      <Button download="competitors.csv" href="data:text/csv,keyword">
        Export
      </Button>,
    );

    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute(
      "download",
      "competitors.csv",
    );
  });

  it("keeps pill spacing and rounded shape above the MUI ButtonBase reset", () => {
    render(
      <Pill active size="sm">
        Change: Improved
      </Pill>,
    );

    expect(screen.getByRole("button", { name: "Change: Improved" })).toHaveStyle({
      borderRadius: "9999px",
      fontSize: "11px",
      minHeight: "28px",
      paddingLeft: "10px",
      paddingRight: "10px",
    });
  });

  it("renders textarea states", () => {
    render(<Textarea aria-label="Keywords" defaultValue="rank tracker" disabled />);

    const textarea = screen.getByRole("textbox", { name: "Keywords" });
    expect(textarea).toHaveValue("rank tracker");
    expect(textarea).toBeDisabled();
  });
});
