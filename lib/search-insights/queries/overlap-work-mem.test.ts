import { describe, expect, it } from "vitest";
import { overlapWorkMemMb } from "./overlap-work-mem";

describe("overlapWorkMemMb", () => {
  it("defaults to the measured 16 MiB setting and accepts the bounded range", () => {
    expect(overlapWorkMemMb()).toBe(16);
    expect(overlapWorkMemMb("4")).toBe(4);
    expect(overlapWorkMemMb("32")).toBe(32);
  });

  it.each(["3", "33", "16.5", "-1"])("rejects an unsafe value %s", (value) => {
    expect(() => overlapWorkMemMb(value)).toThrow("SEARCH_INSIGHTS_OVERLAP_WORK_MEM_MB");
  });
});
