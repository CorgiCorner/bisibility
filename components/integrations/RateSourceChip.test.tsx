import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RateSourceChip } from "./RateSourceChip";

describe("RateSourceChip", () => {
  it.each([
    [{ source: "manual" as const, unit: "calls" }, "your rate", "text-accent-text"],
    [{ sampleSize: 7, source: "measured" as const, unit: "checks" }, "7 checks", "text-green-text"],
    [
      {
        checkedAt: "2026-07-22T00:00:00.000Z",
        source: "list" as const,
        unit: "calls",
      },
      "list price, Jul 22",
      "text-fg-muted",
    ],
    [{ source: "unknown" as const, unit: "calls" }, "no rate yet", "text-yellow-text"],
  ])("renders %s provenance", (rate, label, className) => {
    render(<RateSourceChip {...rate} />);

    expect(screen.getByText(label)).toHaveClass(className);
    expect(screen.getByText(label).className).not.toMatch(/bg-/);
  });
});
