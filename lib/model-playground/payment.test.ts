import { expect, it } from "vitest";
import { createModelPaymentQuote, modelContentHash, validateModelPaymentQuote } from "./payment";
import { paymentContext } from "./payment.test-support";
import { pricedBinding } from "./usage.test-support";

it("a free quote cannot label a forecast as reported provider spend", () => {
  const context = paymentContext();
  context.columns[0].forecast = {
    amount: "0.05",
    currency: "USD",
    certainty: "reported",
    basis: "provider_response",
    rateCardVersion: null,
  };
  expect(() => createModelPaymentQuote(context)).toThrow();
});

it("freezes opaque settings, estimates, budget and every identity", () => {
  const context = paymentContext();
  const quote = createModelPaymentQuote(context, new Date("2026-11-12T00:00:00Z"));
  expect(validateModelPaymentQuote(quote, context, new Date(quote.createdAt))).toBeNull();
  context.input.prompt = "changed";
  expect(validateModelPaymentQuote(quote, context, new Date(quote.createdAt))).toBe(
    "configuration_changed",
  );
  expect(quote.context.input.prompt).not.toBe("changed");
});

it.each([
  ["credential", "credential_changed"],
  ["catalog", "catalog_changed"],
  ["rates", "rate_card_changed"],
  ["budget", "budget_changed"],
] as const)("refuses changed %s", (change, reason) => {
  const context = paymentContext();
  const now = new Date("2026-11-12T00:00:00Z");
  const quote = createModelPaymentQuote(context, now);
  if (change === "credential") context.columns[0].binding.credentialVersion = "b".repeat(64);
  if (change === "catalog") context.columns[0].catalogRevision = "catalog-v2";
  if (change === "rates")
    context.columns[0].binding.rateCard = {
      ...pricedBinding().rateCard,
      version: "rates-v2",
    };
  if (change === "budget") context.budget.version++;
  expect(validateModelPaymentQuote(quote, context, now)).toBe(reason);
});

it("expires quotes and canonicalizes identical content without column ids or display order", () => {
  const context = paymentContext(2);
  const quote = createModelPaymentQuote(context, new Date("2026-11-12T00:00:00Z"));
  expect(validateModelPaymentQuote(quote, context, new Date(quote.expiresAt))).toBe(
    "quote_expired",
  );
  const reordered = structuredClone(context.input);
  reordered.columns.reverse();
  for (const column of reordered.columns) column.columnId = crypto.randomUUID();
  expect(modelContentHash(reordered)).toBe(modelContentHash(context.input));
  reordered.columns[0].settings.maxOutputTokens++;
  expect(modelContentHash(reordered)).not.toBe(modelContentHash(context.input));
});
