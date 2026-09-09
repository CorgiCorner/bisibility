import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("keeps an accessible label for incomplete history", () => {
    render(<Sparkline ariaLabel="Monthly volume trend" data={[10, null, 20]} />);
    expect(screen.getByRole("img", { name: "Monthly volume trend" })).toBeInTheDocument();
  });
});
