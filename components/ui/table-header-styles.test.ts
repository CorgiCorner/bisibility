import { describe, expect, it } from "vitest";
import { tableHeaderClassName } from "./table-header-styles";

describe("tableHeaderClassName", () => {
  it("references the shared background token, not the generic sunken surface", () => {
    expect(tableHeaderClassName).toContain("bg-table-header-bg");
    expect(tableHeaderClassName).not.toContain("bg-bg-sunken");
    expect(tableHeaderClassName).not.toContain("bg-[var(--table-header-bg)]");
  });

  it("rules every header on its top and bottom edges", () => {
    expect(tableHeaderClassName).toContain("border-y");
    expect(tableHeaderClassName).toContain("border-border");
  });

  it("pins Sans, 10px, uppercase, and eyebrow tracking for all headers", () => {
    expect(tableHeaderClassName).not.toContain("font-mono");
    expect(tableHeaderClassName).toContain("font-sans");
    expect(tableHeaderClassName).toContain("text-[10px]");
    expect(tableHeaderClassName).toContain("uppercase");
    expect(tableHeaderClassName).toContain("tracking-[0.08em]");
    expect(tableHeaderClassName).not.toContain("text-[11px]");
    expect(tableHeaderClassName).not.toContain("tracking-[0.5px]");
  });

  it("uses the muted foreground token for header text", () => {
    expect(tableHeaderClassName).toContain("text-fg-muted");
  });
});
