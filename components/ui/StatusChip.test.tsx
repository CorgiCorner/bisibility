import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "./StatusChip";

function chipFor(label: string): HTMLElement {
  const chip = screen.getByText(label).closest<HTMLElement>("[data-status-chip-tone]");
  if (!chip) throw new Error(`Missing chip for ${label}`);
  return chip;
}

describe("StatusChip", () => {
  it("renders the prototype default geometry and positive ramp", () => {
    render(<StatusChip label="Connected" />);

    const chip = chipFor("Connected");
    expect(chip).toHaveClass("h-5", "rounded-full", "text-[11px]", "font-medium");
    expect(chip.getAttribute("style")).toContain(
      "background-color: color-mix(in srgb, var(--green) 12%, var(--bg-elev))",
    );
    expect(chip.getAttribute("style")).toContain(
      "border-color: color-mix(in srgb, var(--green) 28%, var(--bg-elev))",
    );
    expect(chip.querySelector("[data-status-chip-dot]")).toHaveStyle({
      backgroundColor: "var(--green)",
    });
  });

  it("uses the shorter neutral ramp", () => {
    render(<StatusChip label="Not started" tone="neutral" />);

    const style = chipFor("Not started").getAttribute("style");
    expect(style).toContain("var(--fg) 6%");
    expect(style).toContain("var(--fg) 17%");
  });

  it("supports outline and solid treatments without dropping the border", () => {
    const { rerender } = render(<StatusChip label="Paused" tone="neutral" variant="outline" />);
    expect(chipFor("Paused").getAttribute("style")).toContain("background-color: transparent");

    rerender(<StatusChip label="Running" tone="accent" variant="solid" />);
    const solid = chipFor("Running");
    expect(solid.getAttribute("style")).toContain("background-color: var(--accent-solid)");
    expect(solid.getAttribute("style")).toContain("border-color: var(--accent-solid)");
    expect(solid.getAttribute("style")).toContain("color: var(--accent-on-solid)");
  });

  it("lets an icon replace the dot and applies its requested weight", () => {
    render(<StatusChip dot icon="check-circle" label="Succeeded" tone="positive" />);

    expect(screen.queryByTestId("status-chip-dot")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-chip-icon")).toHaveAttribute(
      "data-status-chip-icon",
      "check-circle",
    );
    expect(screen.getByTestId("status-chip-icon")).toHaveAttribute("data-icon-weight", "regular");
  });

  it("hides the dot and uses the medium square geometry when requested", () => {
    render(<StatusChip dot={false} label="Importing" shape="square" size="md" />);

    expect(screen.queryByTestId("status-chip-dot")).not.toBeInTheDocument();
    expect(chipFor("Importing")).toHaveClass("h-6", "rounded-control", "text-[12.5px]");
  });

  it("marks only an enabled dot as breathing", () => {
    const { rerender } = render(<StatusChip label="Running" pulse tone="accent" />);
    expect(screen.getByTestId("status-chip-dot")).toHaveClass("status-chip-breathe");

    rerender(<StatusChip dot={false} label="Running" pulse tone="accent" />);
    expect(screen.queryByTestId("status-chip-dot")).not.toBeInTheDocument();
  });

  it("uses the prototype fallback for an empty label", () => {
    render(<StatusChip label="" />);
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("uses a live region only when a single changing status requests one", () => {
    render(<StatusChip label="Running" live />);
    expect(screen.getByRole("status", { name: "Running" })).toBeInTheDocument();
  });
});
