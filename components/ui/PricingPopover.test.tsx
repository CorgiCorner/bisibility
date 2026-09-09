import type { PricingRow } from "@/components/ui/PricingPopover";
import { PricingPopover, pricingTriggerClassName } from "@/components/ui/PricingPopover";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const twoRows: PricingRow[] = [
  { label: "Profile summary", value: "$0.02" },
  { label: "Link rows", value: "$0.01 / 100" },
];

function PricingHarness({
  eyebrow,
  footer,
  rows = twoRows,
}: {
  eyebrow?: string;
  footer: React.ReactNode;
  rows?: readonly PricingRow[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button onClick={(event) => setAnchor(event.currentTarget)} type="button">
        How is this priced?
      </button>
      <PricingPopover
        anchor={anchor}
        eyebrow={eyebrow}
        footer={footer}
        onClose={() => setAnchor(null)}
        rows={rows}
      />
    </>
  );
}

describe("PricingPopover", () => {
  it("underlines pricing triggers only during hover or keyboard focus", () => {
    const classes = pricingTriggerClassName.split(" ");

    expect(classes).not.toContain("underline");
    expect(classes).toContain("hover:underline");
    expect(classes).toContain("focus-visible:underline");
    expect(classes).toContain("decoration-border-control");
    expect(classes).toContain("underline-offset-4");
    expect(classes).toContain("transition-colors");
    expect(classes).toContain("hover:text-fg");
  });

  it("renders every supplied row label and value once the anchor is set", () => {
    render(
      <PricingHarness
        footer={<span>Neutral footer copy about cached results.</span>}
        rows={[
          { label: "Profile summary", value: "$0.02" },
          { label: "Link rows", value: "$0.01 / 100" },
          { label: "Monthly history", value: "$0.04" },
          { label: "Repeat within 12 hours", value: "free from cache" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    expect(screen.getByText("Profile summary")).toBeInTheDocument();
    expect(screen.getByText("$0.02")).toBeInTheDocument();
    expect(screen.getByText("Link rows")).toBeInTheDocument();
    expect(screen.getByText("$0.01 / 100")).toBeInTheDocument();
    expect(screen.getByText("Monthly history")).toBeInTheDocument();
    expect(screen.getByText("Repeat within 12 hours")).toBeInTheDocument();
    expect(screen.getByText("free from cache")).toBeInTheDocument();
  });

  it("renders the default eyebrow when eyebrow is not passed", () => {
    render(<PricingHarness footer={<span>Footer copy.</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    expect(screen.getByText("Provider cost")).toBeInTheDocument();
  });

  it("renders a custom eyebrow when eyebrow is passed", () => {
    render(<PricingHarness eyebrow="Cost per part" footer={<span>Footer copy.</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    expect(screen.getByText("Cost per part")).toBeInTheDocument();
    expect(screen.queryByText("Provider cost")).not.toBeInTheDocument();
  });

  it("renders arbitrary footer React content including a nested link", () => {
    render(
      <PricingHarness
        footer={
          <span>
            Charges apply to your own account. See the{" "}
            <a href="/docs/pricing" rel="noreferrer" target="_blank">
              pricing guide
            </a>{" "}
            for details.
          </span>
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    const link = screen.getByRole("link", { name: "pricing guide" });
    expect(link).toHaveAttribute("href", "/docs/pricing");
    expect(screen.getByText(/charges apply to your own account/i)).toBeInTheDocument();
  });

  it("renders nothing when anchor is null", () => {
    render(
      <PricingPopover
        anchor={null}
        footer={<span>Footer copy.</span>}
        onClose={() => undefined}
        rows={twoRows}
      />,
    );

    expect(screen.queryByText("Profile summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Provider cost")).not.toBeInTheDocument();
  });

  it("closes through onClose when Escape is pressed", async () => {
    render(<PricingHarness footer={<span>Footer copy.</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));
    expect(screen.getByText("Profile summary")).toBeInTheDocument();

    const popoverRoot = screen.getByRole("dialog");
    expect(popoverRoot).not.toBeNull();
    fireEvent.keyDown(popoverRoot as Element, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText("Profile summary")).not.toBeInTheDocument());
  });

  it("keys duplicate row labels uniquely", () => {
    const errors: unknown[][] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });

    render(
      <PricingHarness
        footer={<span>Footer copy.</span>}
        rows={[
          { label: "Link rows", value: "$0.01 / 100" },
          { label: "Link rows", value: "$0.05 / 500" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    expect(screen.getAllByText("Link rows")).toHaveLength(2);
    expect(errors.flat().join(" ")).not.toMatch(/same key/i);
    consoleError.mockRestore();
  });

  it("gives the value cell the whitespace-nowrap class", () => {
    render(<PricingHarness footer={<span>Footer copy.</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "How is this priced?" }));

    expect(screen.getByText("$0.02")).toHaveClass("whitespace-nowrap");
  });
});
