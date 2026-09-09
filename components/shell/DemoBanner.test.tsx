import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoBanner } from "./DemoBanner";

describe("demo banner", () => {
  it("names read-only access and the real snapshot date instead of beta or live freshness", () => {
    render(<DemoBanner capturedAt="2026-09-06T12:00:00.000Z" />);
    expect(screen.getByRole("status")).toHaveTextContent("Read-only demo.");
    expect(screen.getByText("Snapshot: 2026-09-06 UTC")).toHaveAttribute(
      "datetime",
      "2026-09-06T12:00:00.000Z",
    );
    expect(screen.queryByText(/beta/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("never invents a date if no snapshot marker exists", () => {
    render(<DemoBanner capturedAt={null} />);
    expect(screen.queryByText(/Snapshot:/)).not.toBeInTheDocument();
  });
});
