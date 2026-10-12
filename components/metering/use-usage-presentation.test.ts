import { budgetFixture } from "@/lib/metering/shared-view-fixtures";
import en from "@/messages/core/en/shared.json";
import pl from "@/messages/core/pl/shared.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsagePresentationFigure, UsagePresentationOptions } from "./usage-number-format";
import { useUsagePresentation } from "./use-usage-presentation";

const locale = vi.hoisted(() => ({ value: "en" }));
const saved = vi.hoisted(() => ({ options: {} as UsagePresentationOptions }));
vi.mock("next-intl", () => ({
  useLocale: () => locale.value,
  useMessages: () => (locale.value === "pl" ? pl : en),
}));
vi.mock("./use-usage-display-settings", () => ({
  useUsageDisplaySettings: () => ({ options: saved.options }),
}));

function amount(text: string, unit = "cents"): UsagePresentationFigure {
  return { text, unit, certainty: "measured" };
}

beforeEach(() => {
  locale.value = "en";
  saved.options = {};
});

describe("usage display precision", () => {
  it.each(["cents", "customer_cents", "budget_cents"])(
    "shows %s as currency with two decimal places",
    (unit) => {
      const p = useUsagePresentation();
      expect(p.figure(amount("7.4071", unit))).toBe("$0.07");
      expect(p.figure(amount("5000", unit))).toBe("$50.00");
      expect(p.figure(amount("0.0001", unit))).toBe("$0.00");
      expect(p.unit(unit)).toBe("");
    },
  );

  it("preserves exact large amounts without a number conversion", () => {
    const p = useUsagePresentation();
    expect(p.figure(amount("9007199254740993123456.74071"))).toBe("$90,071,992,547,409,931,234.57");
    expect(p.figure(amount("9007199254740993.234567", "tokens"))).toBe("9,007,199,254,740,993.23");
  });

  it("supports four visible money places and up to four quantity places", () => {
    const p = useUsagePresentation({ moneyFractionDigits: 4, quantityFractionDigits: 4 });
    expect(p.figure(amount("7.4071"))).toBe("$0.0741");
    expect(p.figure(amount("100"))).toBe("$1.0000");
    expect(p.figure(amount("7.407123", "tokens"))).toBe("7.4071");
    expect(p.figure(amount("7", "tokens"))).toBe("7");
  });

  it("supports raw money units independently of quantity formatting", () => {
    const p = useUsagePresentation({ moneyDisplay: "raw-unit" });
    expect(p.figure(amount("7", "tokens"))).toBe("7");
    expect(p.figure(amount("7"))).toBe("7.00");
    expect(p.figure(amount("7.4071"))).toBe("7.41");
    expect(p.unit("cents")).toBe(en.shared.usageViews.units.cents);
  });

  it("shares saved preferences while explicit options override them", () => {
    saved.options = { moneyDisplay: "raw-unit", moneyFractionDigits: 4, quantityFractionDigits: 4 };
    expect(useUsagePresentation().figure(amount("7.4071"))).toBe("7.4071");
    const p = useUsagePresentation({ moneyDisplay: "currency", moneyFractionDigits: 2 });
    expect(p.figure(amount("7.4071"))).toBe("$0.07");
    expect(p.options).toEqual({
      moneyDisplay: "currency",
      moneyFractionDigits: 2,
      quantityFractionDigits: 4,
    });
  });

  it("limits other measurements to two places without a currency symbol", () => {
    const p = useUsagePresentation();
    expect(p.figure(amount("7.4071", "tokens"))).toBe("7.41");
    expect(p.figure(amount("7", "paid_attempts"))).toBe("7");
    expect(p.unit("paid_attempts")).toBe("Paid attempts");
  });

  it("uses the locale and an explicit money currency without currency conversion", () => {
    expect(useUsagePresentation().figure({ ...amount("7.4071"), currency: "EUR" })).toBe("€0.07");
    locale.value = "pl";
    expect(useUsagePresentation().figure(amount("7.4071")).replace(/\s/g, " ")).toBe("0,07 USD");
  });

  it("never rounds an estimated lower bound upward", () => {
    const p = useUsagePresentation();
    expect(p.figure({ ...amount("199.9999"), certainty: "estimated" })).toBe("$1.99");
    expect(p.figure({ ...amount("1.9999", "tokens"), certainty: "estimated" })).toBe("1.99");
  });

  it("does not turn unknown figures into zero", () => {
    expect(useUsagePresentation().figure({ ...amount(""), certainty: "unknown" })).toBe("");
  });

  it.each([-1, 1.5, 21, Number.NaN])("rejects unsupported display precision %s", (digits) => {
    expect(() => useUsagePresentation({ moneyFractionDigits: digits })).toThrow(RangeError);
  });
});

it("formats budget amounts without replacing original figures or geometry", () => {
  const source = {
    ...budgetFixture("7.4071", "budget_cents"),
    used: amount("7.4071", "budget_cents"),
    reserved: { ...amount("", "budget_cents"), certainty: "unknown" as const },
    remaining: "unavailable" as const,
    limit: amount("100.0000", "budget_cents"),
    boundary: { onExceed: "allow" as const, hardLimit: amount("120.0000", "budget_cents") },
    alerts: [{ key: "amount", crossed: false, at: amount("33.3333", "budget_cents") }],
    bar: { used: "7.4071", reserved: "0", limit: "83.3333", hardLimit: "100", alerts: ["27.7777"] },
  };
  const before = structuredClone(source);
  Object.freeze(source);
  Object.freeze(source.used);
  const p = useUsagePresentation();
  expect(p.figure(source.used)).toBe("$0.07");
  expect(p.figure(source.reserved)).toBe("");
  expect(p.figure(source.limit)).toBe("$1.00");
  expect(p.figure(source.boundary.hardLimit)).toBe("$1.20");
  expect(p.figure(source.alerts[0].at)).toBe("$0.33");
  expect(source).toEqual(before);
  expect(p.bound(source)).not.toContain("cents");
  expect(p.bound(source)).not.toMatch(/ · $/);
});
