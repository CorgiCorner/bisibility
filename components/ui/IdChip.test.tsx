import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdChip } from "./IdChip";

describe("IdChip", () => {
  it("limits Mono to the opaque machine identifier", () => {
    render(<IdChip value="prj_8fK2Qf9m" />);

    expect(screen.getByText("prj_8fK2Qf9m")).toHaveClass("font-mono");
    expect(screen.getByRole("button", { name: "Copy ID" })).not.toHaveClass("font-mono");
  });
});
