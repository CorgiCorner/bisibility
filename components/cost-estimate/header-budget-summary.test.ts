import { budgetFixture } from "@/lib/metering/shared-view-fixtures";
import { describe, expect, it } from "vitest";
import { headerBudgetFigure, headerBudgetSummary } from "./header-budget-summary";

const base = budgetFixture();
const figure = (text: string, certainty: "measured" | "estimated" = "measured") => ({
  text,
  unit: "cents",
  certainty,
});

describe("header budget summary", () => {
  it("retains overflow and severity when another budget is unavailable", () => {
    const result = headerBudgetSummary([
      {
        ...base,
        used: { ...(base.used as object), text: "150", unit: "units", certainty: "measured" },
        level: "exceeded",
      },
      { ...base, used: "unavailable", level: "unavailable" },
    ]);
    expect(result).toMatchObject({ percent: 150, level: "exceeded", partial: true });
  });
  it("includes reservations and the hard limit in the selected ratio", () => {
    expect(
      headerBudgetSummary([
        {
          ...base,
          used: { text: "80", unit: "units", certainty: "measured" },
          reserved: { text: "40", unit: "units", certainty: "measured" },
          boundary: {
            onExceed: "allow",
            hardLimit: { text: "200", unit: "units", certainty: "measured" },
          },
          level: "warning",
        },
      ]),
    ).toMatchObject({ percent: 60, level: "warning", partial: false });
  });
  it("preserves a warning with unknown figures without inventing zero", () => {
    expect(headerBudgetSummary([{ ...base, used: "unavailable", level: "warning" }])).toMatchObject(
      { percent: null, level: "warning", partial: true },
    );
  });
  it("never attaches another budget's ratio to an unknown exceeded bound", () => {
    expect(
      headerBudgetSummary([base, { ...base, used: "unavailable", level: "exceeded" }]),
    ).toMatchObject({ percent: null, level: "exceeded", partial: true });
  });
  it("does not interpret an unlimited budget as incomplete data", () => {
    expect(headerBudgetSummary([base, { ...base, limit: "unlimited" }])).toMatchObject({
      percent: 62,
      partial: false,
    });
  });
  it("ignores redacted figures when choosing the displayed budget", () => {
    expect(
      headerBudgetSummary([base, { ...base, redacted: true, level: "unavailable" }]),
    ).toMatchObject({ percent: 62, level: "ok", partial: true });
  });
});

describe("header budget currency", () => {
  it("leaves customer credits to the normal formatter with its unit suffix", () => {
    expect(headerBudgetFigure({ ...figure("1000"), unit: "customer_cents" }, "en")).toBeNull();
  });
  it("shows all money in dollars with two visible decimal places", () => {
    expect(headerBudgetFigure(figure("7.4071"), "en")).toBe("$0.07");
    expect(headerBudgetFigure(figure("5000"), "en")).toBe("$50.00");
    expect(headerBudgetFigure(figure("0.0001"), "en")).toBe("$0.00");
  });
  it("supports explicitly requested display precision", () => {
    expect(headerBudgetFigure(figure("7.4071"), "en", { moneyFractionDigits: 4 })).toBe("$0.0741");
  });
  it("does not round an estimated lower bound upward", () => {
    expect(headerBudgetFigure(figure("199.9999", "estimated"), "en")).toBe("$1.99");
  });
  it("keeps exact money within the storage range", () => {
    expect(headerBudgetFigure(figure("900719925474.0993"), "en")).toBe("$9,007,199,254.74");
  });
  it("keeps non-monetary quantities out of currency formatting", () => {
    expect(headerBudgetFigure({ ...figure("7"), unit: "requests" }, "en")).toBeNull();
  });
});

it("rejects negative money before decimal shifting", () => {
  expect(headerBudgetFigure(figure("-5"), "en")).toBeNull();
});
