import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
  it("uses the shared transparent field treatment", () => {
    render(<Input aria-label="Project name" placeholder="Enter a project name" />);

    const input = screen.getByRole("textbox", { name: "Project name" });
    expect(input).toHaveClass(
      "border-border-strong",
      "bg-transparent",
      "placeholder:text-fg-muted",
    );
  });
});
