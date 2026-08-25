import { serpDepthValues } from "@/lib/serp/markets";
import { describe, expect, it } from "vitest";
import { ANONYMOUS_CALCULATOR_DEFAULTS } from "./calculator-defaults";

describe("anonymous calculator defaults", () => {
  it("starts at Top 20 depth and 100 keywords", () => {
    expect(serpDepthValues).toContain(20);
    expect(ANONYMOUS_CALCULATOR_DEFAULTS.inputs.depth).toBe(20);
    expect(ANONYMOUS_CALCULATOR_DEFAULTS.inputs.keywordCount).toBe(100);
  });
});
