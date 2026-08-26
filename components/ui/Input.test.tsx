import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";
import {
  compactInputClassName,
  compactInputGeometryClassName,
  compactInputTypographyClassName,
  inputClassName,
} from "./input-styles";

describe("Input", () => {
  it("uses the shared transparent field treatment", () => {
    render(<Input aria-label="Project name" placeholder="Enter a project name" />);

    const input = screen.getByRole("textbox", { name: "Project name" });
    expect(input).toHaveClass(
      "border-border-control",
      "bg-transparent",
      "placeholder:text-[12px]",
      "placeholder:leading-4",
      "placeholder:text-fg-muted",
    );
  });

  it("keeps reusable style values in a server-safe module", () => {
    // Read the file rather than importing it with ?raw: that bundler-only
    // specifier cannot be resolved by the public allowlist boundary check.
    const source = readFileSync(resolve(import.meta.dirname, "input-styles.ts"), "utf8");

    expect(source).not.toContain('"use client"');
    expect(inputClassName).toContain("placeholder:text-[12px]");
    expect(compactInputTypographyClassName).toContain("compact-text-12");
    expect(compactInputTypographyClassName).toContain("text-[12px]");
    expect(compactInputTypographyClassName).toContain("placeholder:leading-4");
    expect(compactInputGeometryClassName).toBe("min-h-[34px] py-1");
    expect(compactInputClassName).toContain(compactInputTypographyClassName);
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
