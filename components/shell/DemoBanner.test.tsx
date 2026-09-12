import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoBanner } from "./DemoBanner";

describe("demo banner", () => {
  it("names read-only access and the real snapshot date instead of beta or live freshness", () => {
    render(
      <DemoBanner actor="viewer" capturedAt="2026-09-06T12:00:00.000Z" mode="legacy-read-only" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Read-only demo.");
    expect(screen.getByText("Snapshot: 2026-09-06 UTC")).toHaveAttribute(
      "datetime",
      "2026-09-06T12:00:00.000Z",
    );
    expect(screen.queryByText(/beta/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("never invents a date if no snapshot marker exists", () => {
    render(<DemoBanner actor="viewer" capturedAt={null} mode="legacy-read-only" />);
    expect(screen.queryByText(/Snapshot:/)).not.toBeInTheDocument();
  });

  it("describes editable Viewer access without claiming a snapshot", () => {
    render(<DemoBanner actor="viewer" capturedAt="2026-09-06T12:00:00.000Z" mode="editable" />);

    expect(screen.getByRole("status")).toHaveTextContent("Read-only demo.");
    expect(screen.getByRole("status")).not.toHaveTextContent("Editable demo.");
    expect(screen.getByRole("status")).toHaveTextContent("read-only saved data");
    expect(screen.queryByText(/Snapshot:/)).not.toBeInTheDocument();
  });

  it("tells editable Owners that their changes are visible to demo visitors", () => {
    render(<DemoBanner actor="owner" capturedAt={null} mode="editable" />);

    expect(screen.getByRole("status")).toHaveTextContent("Demo workspace.");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Changes you make here are visible to demo visitors.",
    );
    expect(screen.queryByText(/Snapshot:/)).not.toBeInTheDocument();
  });
});
