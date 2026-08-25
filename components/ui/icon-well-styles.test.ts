import { describe, expect, it } from "vitest";
import {
  dangerIconWellClassName,
  iconWellClassName,
  iconWellSurfaceClassName,
} from "./icon-well-styles";

describe("icon well classes", () => {
  it("keeps decorative wells quieter than a primary action fill", () => {
    expect(iconWellClassName).toContain("bg-accent-soft");
    expect(iconWellClassName).toContain("text-accent-solid");
    expect(iconWellClassName).not.toContain("bg-accent-solid");
    expect(iconWellClassName).not.toContain("text-accent-on-solid");
    expect(iconWellClassName).not.toContain("text-accent-text");
  });

  it("puts danger glyphs on the same soft surface", () => {
    expect(dangerIconWellClassName).toContain(iconWellSurfaceClassName);
    expect(dangerIconWellClassName).toContain("text-red-text");
    expect(dangerIconWellClassName).not.toContain("color-mix");
  });
});
