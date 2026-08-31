import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloudBetaCoverageModal } from "./CloudBetaCoverageModal";

describe("CloudBetaCoverageModal", () => {
  it("gives covered and not-yet policy equal sections", () => {
    const onClose = vi.fn();
    render(<CloudBetaCoverageModal onClose={onClose} onExport={vi.fn()} open projectRef="prj_1" />);

    expect(screen.getByRole("heading", { name: "Covered" }).parentElement).toHaveTextContent(
      "Rank checks run on schedule",
    );
    expect(screen.getByRole("heading", { name: "Not yet" }).parentElement).toHaveTextContent(
      "No restore guarantee.",
    );
    expect(screen.getByText("What the hosted beta covers")).toBeInTheDocument();
    expect(
      screen.getByText("No guaranteed migration path between hosted regions."),
    ).toBeInTheDocument();
    const ourSideCopy = screen.getByText("On our side");
    const yourSideCopy = screen.getByText("On your side");
    const pricingCopy = screen.getByText(/30 days notice before pricing/);
    const neutralRows = [
      ourSideCopy.closest("div.rounded-control"),
      yourSideCopy.closest("div.rounded-control"),
      pricingCopy.closest("div.rounded-control"),
    ];

    expect(ourSideCopy.parentElement).toHaveTextContent("Nightly snapshots are kept for 7 days");
    expect(yourSideCopy.parentElement).toHaveTextContent("Keep a recent export.");
    expect(screen.queryByText("On yours")).not.toBeInTheDocument();
    expect(pricingCopy).toHaveTextContent(/Self-host stays available\.$/);
    for (const row of neutralRows) {
      expect(row).toHaveClass("border-border");
      expect(row).not.toHaveClass("border-accent", "bg-accent-soft", "bg-bg-sunken");
      expect(row?.querySelector("svg")).toHaveClass("text-fg-muted");
    }
    expect(pricingCopy.closest("div.rounded-control")?.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "info",
    );
    expect(screen.queryByRole("link", { name: "See plan and billing" })).not.toBeInTheDocument();
  });

  it("opens the project export from its footer CTA", () => {
    const onExport = vi.fn();
    render(
      <CloudBetaCoverageModal onClose={vi.fn()} onExport={onExport} open projectRef="prj_1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export data" }));

    expect(onExport).toHaveBeenCalledOnce();
  });
});
