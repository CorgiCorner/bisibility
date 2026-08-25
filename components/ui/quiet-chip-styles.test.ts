import { describe, expect, it } from "vitest";
import { quietChipVariants } from "./quiet-chip-styles";

describe("quietChipVariants", () => {
  it("pins lg to the keyword-header chip height", () => {
    expect(quietChipVariants({ size: "lg" })).toContain("h-[27px]");
    expect(quietChipVariants({ size: "lg" })).toContain("min-h-[27px]");
  });

  it("keeps the compact market-chip heights on sm and md", () => {
    expect(quietChipVariants({ size: "sm" })).toContain("h-[22px]");
    expect(quietChipVariants({ size: "md" })).toContain("h-6");
  });
});
