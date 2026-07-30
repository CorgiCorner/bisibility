import { describe, expect, it } from "vitest";
import { formatMoneyCents } from "./money";

describe("formatMoneyCents", () => {
  it("renders amounts under $100 with two decimals", () => {
    expect(formatMoneyCents(0)).toBe("$0.00");
    expect(formatMoneyCents(9)).toBe("$0.09");
    expect(formatMoneyCents(1240)).toBe("$12.40");
    expect(formatMoneyCents(5000)).toBe("$50.00");
    expect(formatMoneyCents(9999)).toBe("$99.99");
  });

  it("renders $100 and above as whole dollars with thousands separators", () => {
    expect(formatMoneyCents(10000)).toBe("$100");
    expect(formatMoneyCents(10680)).toBe("$107");
    expect(formatMoneyCents(1000000)).toBe("$10,000");
    expect(formatMoneyCents(123456789)).toBe("$1,234,568");
  });

  it("keeps the sign in front of the dollar amount", () => {
    expect(formatMoneyCents(-1240)).toBe("-$12.40");
  });
});
