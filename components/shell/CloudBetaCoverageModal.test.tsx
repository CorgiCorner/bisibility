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
    expect(screen.getByText("On our side").parentElement).toHaveTextContent(
      "Nightly snapshots are kept for 7 days",
    );
    expect(screen.getByText("On yours").parentElement).toHaveTextContent("Keep a recent export.");
    const betaEnds = screen.getByRole("heading", { name: "When the beta ends" }).parentElement;
    expect(betaEnds).toHaveTextContent(/Self-host stays available\.$/);
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
