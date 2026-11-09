import { describe, expect, it } from "vitest";
import { seoMixDate, seoMixMoney } from "./seo-mix-format";

describe("estimate display precision and unavailable values", () => {
  it("keeps sub-cent detail without rounding monthly access incorrectly", () => {
    expect(seoMixMoney("0.0001", "en", true)).toBe("$0.000001");
    expect(seoMixMoney("250.0000", "en")).toBe("$2.50");
    expect(seoMixMoney("100", "pl")).toContain("1,00");
    expect(seoMixMoney("100", "es-ES")).toContain("1,00");
  });
  it.each([null, NaN, Infinity, -1, "invalid", ""])(
    "does not display a fabricated amount for %s",
    (value) => {
      expect(seoMixMoney(value, "en")).toBeNull();
    },
  );
  it("does not throw on missing provenance and uses UTC dates", () => {
    expect(seoMixDate("", "en")).toBeNull();
    expect(seoMixDate("invalid", "ja")).toBeNull();
    expect(seoMixDate("2026-02-31", "en")).toBeNull();
    expect(seoMixDate("2026-11-06T23:30:00Z", "en")).toBe("Nov 6, 2026");
  });
});
