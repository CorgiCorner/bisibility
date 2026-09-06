import { describe, expect, it } from "vitest";
import { resolveDateFormat } from "./resolve";

describe("resolveDateFormat", () => {
  it("passes through an explicit preference", () => {
    expect(resolveDateFormat("day_first")).toBe("day_first");
    expect(resolveDateFormat("month_first")).toBe("month_first");
    expect(resolveDateFormat("iso")).toBe("iso");
  });

  it("resolves auto from Accept-Language: pl to day first, en-US to month first", () => {
    expect(resolveDateFormat("auto", "pl")).toBe("day_first");
    expect(resolveDateFormat("auto", "pl-PL,pl;q=0.9")).toBe("day_first");
    expect(resolveDateFormat("auto", "en-US,en;q=0.9")).toBe("month_first");
  });

  it("falls back to day first when Accept-Language is missing or empty", () => {
    expect(resolveDateFormat("auto")).toBe("day_first");
    expect(resolveDateFormat("auto", null)).toBe("day_first");
    expect(resolveDateFormat("auto", "")).toBe("day_first");
  });
});
