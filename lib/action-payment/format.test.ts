import { describe, expect, it } from "vitest";
import type { PaymentAmount, PaymentUnit } from "./contract";
import { formatPaymentAmount, formatPaymentMaximum, formatPaymentUnit } from "./format";

const usd: PaymentUnit = { kind: "currency", code: "USD" };
const credits: PaymentUnit = {
  kind: "credits",
  key: "bisibility",
  singular: "Credit",
  plural: "Credits",
};
const future: PaymentUnit = {
  kind: "provider_native",
  providerId: "future-vector",
  key: "vector-pages",
  singular: "indexed page",
  plural: "indexed pages",
};
const amount = (
  value: string | null,
  unit: PaymentUnit = usd,
  certainty: PaymentAmount["certainty"] = "measured",
): PaymentAmount => ({ value, unit, certainty });

describe("exact action payment presentation", () => {
  it.each(["measured", "estimate", "free"] as const)(
    "keeps %s zero distinct from a positive estimate",
    (certainty) => {
      expect(formatPaymentAmount(amount("0.000", usd, certainty), "en-US")).toBe("$0.00");
    },
  );
  it.each(["0.004", "0.0000000000000000000000000000000000001"])(
    "shows positive %s below a cent",
    (value) => {
      expect(formatPaymentAmount(amount(value), "en-US")).toBe("< $0.01");
      expect(formatPaymentAmount(amount(value, usd, "estimate"), "en-US")).toBe("≈ < $0.01");
    },
  );
  it("marks only nonzero estimates and adds no measured badge", () => {
    expect(formatPaymentAmount(amount("1.2345"), "en-US")).toBe("$1.2345");
    expect(formatPaymentAmount(amount("1.2345", usd, "estimate"), "en-US")).toBe("≈ $1.2345");
  });
  it("preserves large integer and fractional currency precision", () => {
    expect(
      formatPaymentAmount(amount("90071992547409931234567890.123456789123456789"), "en-US"),
    ).toBe("$90,071,992,547,409,931,234,567,890.123456789123456789");
  });
  it("retains a decimal tail beyond Intl's maximumFractionDigits range", () => {
    const fraction = `${"0".repeat(150)}1`;
    expect(formatPaymentAmount(amount(`1.${fraction}`, credits), "en-US")).toBe(
      `1.${fraction} Credits`,
    );
  });
  it("localizes currency order, grouping, separator and exact fractional digits", () => {
    expect(formatPaymentAmount(amount("1234567.890123"), "pl-PL")).toBe("1 234 567,890123 USD");
    expect(formatPaymentAmount(amount("0.004"), "de-DE")).toBe("< 0,01 $");
  });
  it("localizes a non-Latin digit system without losing the fraction", () => {
    expect(formatPaymentAmount(amount("1234.56789", future), "ar-EG")).toBe(
      "١٬٢٣٤٫٥٦٧٨٩ indexed pages",
    );
  });
  it("respects each currency's minor-unit display while retaining fractional values", () => {
    expect(formatPaymentAmount(amount("0", { kind: "currency", code: "JPY" }), "en-US")).toBe("¥0");
    expect(formatPaymentAmount(amount("1.5", { kind: "currency", code: "JPY" }), "en-US")).toBe(
      "¥1.5",
    );
    expect(formatPaymentAmount(amount("1", { kind: "currency", code: "KWD" }), "en-US")).toBe(
      "KWD 1.000",
    );
    expect(formatPaymentAmount(amount("0.5", { kind: "currency", code: "JPY" }), "en-US")).toBe(
      "< ¥1",
    );
    expect(formatPaymentAmount(amount("0.0004", { kind: "currency", code: "KWD" }), "en-US")).toBe(
      "< KWD 0.001",
    );
    expect(formatPaymentAmount(amount("0.004", { kind: "currency", code: "KWD" }), "en-US")).toBe(
      "KWD 0.004",
    );
  });
  it("uses descriptor labels for credits and arbitrary future native units", () => {
    expect(formatPaymentAmount(amount("1.000", future), "en-US")).toBe("1 indexed page");
    expect(formatPaymentAmount(amount("1.25", future), "en-US")).toBe("1.25 indexed pages");
    expect(formatPaymentAmount(amount("0.0001", credits), "en-US")).toBe("0.0001 Credits");
    expect(formatPaymentAmount(amount("0", future, "estimate"), "en-US")).toBe("0 indexed pages");
    expect(formatPaymentUnit(future)).toBe("indexed pages");
    expect(formatPaymentUnit(usd)).toBe("USD");
  });
  it("retains unknown payment instead of inventing a zero", () => {
    expect(formatPaymentAmount(amount(null, credits, "unknown"), "en-US")).toBe("-");
    expect(formatPaymentAmount(amount("0", credits, "unknown"), "en-US")).toBe("-");
  });
  it("shows an explicit free cache read as zero despite a previous source's expense", () => {
    const receipt = { charge: amount("0", credits, "free"), providerCost: amount("2.50") };
    expect(formatPaymentAmount(receipt.charge, "en-US")).toBe("0 Credits");
    expect(formatPaymentAmount(receipt.providerCost, "en-US")).toBe("$2.50");
  });
  it("formats a supplied enforced ceiling in the same unit, with no estimate label", () => {
    expect(formatPaymentMaximum({ value: "12.001", unit: future }, "en-US")).toBe(
      "12.001 indexed pages",
    );
  });
  it.each(["-1", "NaN", "1e3", "01.00", " 1", "1,25"])(
    "does not render malformed decimal %s",
    (value) => {
      expect(formatPaymentAmount(amount(value), "en-US")).toBe("-");
    },
  );
});

const display = (moneyFractionDigits: number, quantityFractionDigits: number) => ({
  moneyFractionDigits,
  quantityFractionDigits,
});

describe("project display precision", () => {
  it("keeps the exact amount when no display option is supplied", () => {
    expect(formatPaymentAmount(amount("9.8889", credits, "estimate"), "en-US")).toBe(
      "≈ 9.8889 Credits",
    );
    expect(formatPaymentAmount(amount("1.2345"), "en-US")).toBe("$1.2345");
    expect(formatPaymentAmount(amount("0", credits, "estimate"), "en-US")).toBe("0 Credits");
  });

  it("rounds credits and currency to 0, 2 and 4 digits", () => {
    expect(formatPaymentAmount(amount("9.8889", credits, "estimate"), "en-US", display(2, 2))).toBe(
      "≈ 9.89 Credits",
    );
    expect(formatPaymentAmount(amount("9.8889", credits), "en-US", display(0, 0))).toBe(
      "10 Credits",
    );
    expect(formatPaymentAmount(amount("9.88889", credits), "en-US", display(4, 4))).toBe(
      "9.8889 Credits",
    );
    expect(formatPaymentAmount(amount("1.234"), "en-US", display(2, 2))).toBe("$1.23");
    expect(formatPaymentAmount(amount("1.234"), "en-US", display(0, 0))).toBe("$1");
    expect(formatPaymentAmount(amount("1.5"), "en-US", display(0, 0))).toBe("$2");
    expect(formatPaymentAmount(amount("1.23456"), "en-US", display(4, 4))).toBe("$1.2346");
  });

  it("keeps the estimate prefix and shows a quantity floor for tiny non-zero values", () => {
    expect(formatPaymentAmount(amount("0.004", credits, "estimate"), "en-US", display(2, 2))).toBe(
      "≈ < 0.01 Credits",
    );
    expect(formatPaymentAmount(amount("0.00004", credits), "en-US", display(4, 4))).toBe(
      "< 0.0001 Credits",
    );
    expect(formatPaymentAmount(amount("0.4", credits, "estimate"), "en-US", display(0, 0))).toBe(
      "≈ < 1 Credit",
    );
    expect(formatPaymentAmount(amount("0", credits, "estimate"), "en-US", display(2, 2))).toBe(
      "0 Credits",
    );
    expect(formatPaymentAmount(amount("0.004"), "en-US", display(4, 4))).toBe("< $0.01");
  });

  it("ignores a precision outside the project display set", () => {
    expect(formatPaymentAmount(amount("9.8889", credits), "en-US", display(5, 2))).toBe(
      "9.8889 Credits",
    );
  });
});
