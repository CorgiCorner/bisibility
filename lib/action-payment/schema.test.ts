import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ActionPaymentQuote, ActionPaymentReceipt, PaymentUnit } from "./contract";
import {
  acceptedActionPaymentSchema,
  actionPaymentOptionSchema,
  actionPaymentQuoteSchema,
  actionPaymentReceiptSchema,
  paymentAmountSchema,
  paymentUnitSchema,
  samePaymentUnit,
} from "./schema";

const unit: PaymentUnit = {
  kind: "provider_native",
  providerId: "future-adapter",
  key: "document-pages",
  singular: "document page",
  plural: "document pages",
};
function quote(): ActionPaymentQuote {
  return {
    id: "quote-example",
    quoteToken: "opaque-signed-token",
    expiresAt: "2026-10-21T23:00:00Z",
    option: {
      id: "option-concrete",
      connectionId: "conn_a00000000000000000000000",
      providerId: "future-adapter",
      providerLabel: "Future Adapter",
      fundingSource: "byok",
      payableUnit: unit,
    },
    charge: { value: "1.0000000000000000001", certainty: "estimate", unit },
    cache: { state: "miss", freeUntil: null, windowSeconds: null },
    availability: { allowed: true, reason: null },
  };
}
function receipt(): ActionPaymentReceipt {
  const original = quote();
  return {
    actionId: "action-example",
    quoteId: original.id,
    option: original.option,
    state: "settled",
    charge: { ...original.charge, certainty: "measured" },
  };
}

describe("strict neutral action payment DTOs", () => {
  it("keeps parsed quote and receipt types aligned with the public contract", () => {
    const input: z.input<typeof actionPaymentQuoteSchema> = quote();
    const parsed: ActionPaymentQuote = actionPaymentQuoteSchema.parse(input);
    const receiptInput: z.input<typeof actionPaymentReceiptSchema> = receipt();
    const parsedReceipt: ActionPaymentReceipt = actionPaymentReceiptSchema.parse(receiptInput);
    expect(parsed).toEqual(input);
    expect(parsedReceipt).toEqual(receiptInput);
  });
  it("accepts a future native descriptor without adding a provider enum", () => {
    expect(actionPaymentQuoteSchema.parse(quote())).toEqual(quote());
    expect(actionPaymentReceiptSchema.parse(receipt())).toEqual(receipt());
  });
  it.each(["USD", "PLN", "EUR", "JPY", "KWD"])("accepts ISO currency %s", (code) => {
    expect(paymentUnitSchema.safeParse({ kind: "currency", code }).success).toBe(true);
  });
  it.each(["usd", "FAKE", "ZZZ", "BTC"])("rejects an unsupported/non-ISO currency %s", (code) => {
    expect(paymentUnitSchema.safeParse({ kind: "currency", code }).success).toBe(false);
  });
  it.each(["-0", "-1", "1e3", "01", "+1", "1.", "1,23"])(
    "rejects non-decimal amount %s",
    (value) => {
      expect(paymentAmountSchema.safeParse({ value, unit, certainty: "measured" }).success).toBe(
        false,
      );
    },
  );
  it("retains exact decimal bytes and permits unknown only without a value", () => {
    const charge = {
      value: "90071992547409931234567890.00000000000001",
      unit,
      certainty: "estimate",
    };
    expect(paymentAmountSchema.parse(charge)).toEqual(charge);
    expect(paymentAmountSchema.safeParse({ value: null, unit, certainty: "unknown" }).success).toBe(
      true,
    );
    expect(paymentAmountSchema.safeParse({ value: "0", unit, certainty: "unknown" }).success).toBe(
      false,
    );
    expect(
      paymentAmountSchema.safeParse({ value: null, unit, certainty: "measured" }).success,
    ).toBe(false);
  });
  it("requires actual zero for free amounts", () => {
    expect(paymentAmountSchema.safeParse({ value: "0.000", unit, certainty: "free" }).success).toBe(
      true,
    );
    expect(
      paymentAmountSchema.safeParse({ value: "0.0001", unit, certainty: "free" }).success,
    ).toBe(false);
  });
  it("rejects option/native provider mismatches and internal connection IDs", () => {
    const option = quote().option;
    expect(actionPaymentOptionSchema.safeParse({ ...option, providerId: "another" }).success).toBe(
      false,
    );
    expect(
      actionPaymentOptionSchema.safeParse({ ...option, connectionId: "internal-connection" })
        .success,
    ).toBe(false);
  });
  it("binds charge and enforced maximum to the exact selected unit descriptor", () => {
    const original = quote();
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        charge: {
          ...original.charge,
          unit: { ...unit, key: "different-unit" },
        },
      }).success,
    ).toBe(false);
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        maximumCharge: { value: "10", unit: { kind: "currency", code: "USD" } },
      }).success,
    ).toBe(false);
    expect(samePaymentUnit(unit, { ...unit, plural: "another label" })).toBe(false);
  });
  it("accepts free cache quotes but refuses silent paid cache-only quotes", () => {
    const original = quote();
    const cache = { state: "hit", freeUntil: "2026-10-21T22:59:00Z", windowSeconds: null };
    expect(actionPaymentQuoteSchema.safeParse({ ...original, cache }).success).toBe(false);
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        cache,
        charge: { value: "0", unit, certainty: "free" },
      }).success,
    ).toBe(true);
  });
  it("accepts a positive cache window and rejects a fractional one", () => {
    const original = quote();
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        cache: { state: "miss", freeUntil: null, windowSeconds: 2_592_000 },
      }).success,
    ).toBe(true);
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        cache: { state: "miss", freeUntil: null, windowSeconds: 1.5 },
      }).success,
    ).toBe(false);
  });
  it("requires an unavailable reason and validates local remedy links", () => {
    const original = quote();
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        availability: { allowed: false, reason: null },
      }).success,
    ).toBe(false);
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        availability: { allowed: false, reason: "access_required", remedyHref: "/app/billing" },
      }).success,
    ).toBe(true);
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        availability: {
          allowed: false,
          reason: "access_required",
          remedyHref: "//outside.example",
        },
      }).success,
    ).toBe(false);
  });
  it.each(["pending", "unknown"] as const)(
    "preserves %s receipt without fabricating a debit",
    (state) => {
      const original = receipt();
      expect(actionPaymentReceiptSchema.safeParse({ ...original, state }).success).toBe(false);
      expect(
        actionPaymentReceiptSchema.safeParse({
          ...original,
          state,
          quoteId: null,
          charge: { value: null, unit, certainty: "unknown" },
        }).success,
      ).toBe(true);
    },
  );
  it("requires measured settlement/free zero and keeps upstream expense separate", () => {
    const original = receipt();
    expect(
      actionPaymentReceiptSchema.safeParse({
        ...original,
        charge: { ...original.charge, certainty: "estimate" },
      }).success,
    ).toBe(false);
    expect(
      actionPaymentReceiptSchema.safeParse({
        ...original,
        state: "free",
        charge: { value: "0", unit, certainty: "free" },
        providerCost: {
          value: "0.25",
          unit: { kind: "currency", code: "USD" },
          certainty: "measured",
        },
      }).success,
    ).toBe(true);
  });
  it("keeps wallet omission distinct from a zero balance", () => {
    const original = quote();
    expect(actionPaymentQuoteSchema.parse(original)).not.toHaveProperty("wallet");
    expect(
      actionPaymentQuoteSchema.safeParse({
        ...original,
        wallet: {
          available: {
            value: "0",
            unit: { kind: "credits", key: "wallet", singular: "Credit", plural: "Credits" },
            certainty: "measured",
          },
          canAddCredits: true,
          addCreditsHref: "/app/billing",
        },
      }).success,
    ).toBe(true);
  });
  it("rejects unexpected credential/internal fields rather than stripping them", () => {
    expect(
      actionPaymentQuoteSchema.safeParse({ ...quote(), credential: "not-allowed" }).success,
    ).toBe(false);
    expect(
      actionPaymentOptionSchema.safeParse({ ...quote().option, secretKey: "not-allowed" }).success,
    ).toBe(false);
    expect(acceptedActionPaymentSchema.safeParse({ quoteToken: "token", price: "0" }).success).toBe(
      false,
    );
    expect(acceptedActionPaymentSchema.parse({ quoteToken: "token" })).toEqual({
      quoteToken: "token",
    });
  });
});

describe("batch assessment DTO", () => {
  it("retains exact native and currency groups without conversion", async () => {
    const { actionPaymentBatchAssessmentSchema } = await import("./schema");
    const assessment = {
      allowed: true,
      reason: null,
      charges: [
        quote().charge,
        { unit: { kind: "currency", code: "USD" }, value: "0.00001", certainty: "estimate" },
      ],
    };
    expect(
      actionPaymentBatchAssessmentSchema.parse(assessment).charges.map((charge) => charge.value),
    ).toEqual(["1.0000000000000000001", "0.00001"]);
  });
  it("refuses a top-up remedy for an unrelated denial", async () => {
    const { actionPaymentBatchAssessmentSchema } = await import("./schema");
    expect(
      actionPaymentBatchAssessmentSchema.safeParse({
        allowed: false,
        reason: "budget_exhausted",
        charges: [quote().charge],
        remedyHref: "/billing",
      }).success,
    ).toBe(false);
  });
  it("requires an explicit allowed/reason agreement", async () => {
    const { actionPaymentBatchAssessmentSchema } = await import("./schema");
    expect(
      actionPaymentBatchAssessmentSchema.safeParse({
        allowed: true,
        reason: "insufficient_credits",
        charges: [quote().charge],
      }).success,
    ).toBe(false);
  });
});
