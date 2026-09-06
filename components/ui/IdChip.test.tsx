import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdChip, shortId } from "./IdChip";

describe("IdChip", () => {
  it("shortens stable identifiers to their visible prefix", () => {
    expect(shortId("rcr_9d2e41abcdef")).toBe("rcr_9d2e41");
  });

  it("limits Mono to the opaque machine identifier", () => {
    render(<IdChip value="prj_8fK2Qf9m" />);

    expect(screen.getByText("prj_8fK2Qf9m")).toHaveClass("font-mono");
    expect(screen.getByRole("button", { name: "Copy ID" })).not.toHaveClass("font-mono");
  });

  it("shows a compact identifier while preserving the full ID for copy and its tooltip", () => {
    render(<IdChip displayValue="kw_3f9a2c1" value="kw_3f9a2c1d7e" />);

    expect(screen.getByText("kw_3f9a2c1").parentElement).toHaveAttribute("title", "kw_3f9a2c1d7e");
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeInTheDocument();
  });
});
