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

  it("adopts the semantic control radius and body type with preserved geometry", () => {
    render(<Input aria-label="Search" />);

    const input = screen.getByRole("textbox", { name: "Search" });
    expect(input).toHaveClass(
      "rounded-control",
      "text-ui-body",
      "font-medium",
      "min-h-10",
      "w-full",
    );
    expect(input).toHaveClass("px-" + "[13px]");
    expect(input).toHaveClass("py-" + "[9px]");
  });
});
