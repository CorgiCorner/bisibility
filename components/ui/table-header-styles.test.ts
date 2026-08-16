import { describe, expect, it } from "vitest";
import { tableHeaderClassName } from "./table-header-styles";

describe("tableHeaderClassName", () => {
  it("references the shared background token, not the generic sunken surface", () => {
    expect(tableHeaderClassName).toContain("bg-table-header-bg");
    expect(tableHeaderClassName).not.toContain("bg-bg-sunken");
    expect(tableHeaderClassName).not.toContain("bg-[var(--table-header-bg)]");
  });

  it("pins mono, 11px, uppercase, and 0.5px tracking for all headers", () => {
    expect(tableHeaderClassName).toContain("font-mono");
    expect(tableHeaderClassName).toContain("text-[11px]");
    expect(tableHeaderClassName).toContain("uppercase");
    expect(tableHeaderClassName).toContain("tracking-[0.5px]");
    expect(tableHeaderClassName).not.toContain("text-[10px]");
    expect(tableHeaderClassName).not.toContain("10.5px");
    expect(tableHeaderClassName).not.toContain("0.6px");
  });

  it("uses the muted foreground token for header text", () => {
    expect(tableHeaderClassName).toContain("text-fg-muted");
  });
});
