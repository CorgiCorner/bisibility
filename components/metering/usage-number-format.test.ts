import { describe, expect, it } from "vitest";
import { createUsageNumberFormat } from "./usage-number-format";

const amount = (
  text: string,
  certainty: "measured" | "estimated" = "measured",
  unit = "cents",
) => ({ text, unit, certainty });
describe("clear budget amounts", () => {
  it("keeps exact zero distinct from a positive sub-cent charge", () => {
    const f = createUsageNumberFormat("en");
    expect(f.figure(amount("0"))).toBe("$0.00");
    expect(f.figure(amount("-0.0000"))).toBe("$0.00");
    expect(f.figure(amount("0.0001"))).toBe("< $0.01");
    expect(f.figure(amount("0.9999"))).toBe("< $0.01");
    expect(f.figure(amount("1"))).toBe("$0.01");
  });
  it("marks only nonzero estimates in the shared budget formatter", () => {
    const f = createUsageNumberFormat("en");
    expect(f.budgetFigure(amount("0", "estimated"))).toBe("$0.00");
    expect(f.budgetFigure(amount("120", "estimated"))).toBe("≈ $1.20");
    expect(f.budgetFigure(amount("120"))).toBe("$1.20");
    expect(f.budgetFigure(amount("0.02", "estimated"))).toBe("≈ < $0.01");
  });
  it("keeps native quantities and exact Credits independent of provider USD", () => {
    const f = createUsageNumberFormat("en");
    expect(f.budgetFigure(amount("243", "measured", "units"))).toBe("243");
    expect(f.budgetFigure(amount("13.0001", "measured", "customer_cents"))).toBe("13.0001");
    expect(f.budgetFigure({ text: "", unit: "cents", certainty: "unknown" })).toBeNull();
  });
});
