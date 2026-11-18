import { createModelPaymentQuote } from "@/lib/model-playground/payment";
import { paymentContext } from "@/lib/model-playground/payment.test-support";
import { modelPaymentReservations } from "@/lib/model-playground/payment-reservation";
import { createModelUsageReceipt } from "@/lib/model-playground/usage";
import {
  binding,
  measuredResult,
  pricedBinding,
  reportedResult,
} from "@/lib/model-playground/usage.test-support";
import { expect, it } from "vitest";
import { preparePaidAttempt } from "./current-paid-quote";
import { decimalQuantity } from "./mapping";
import { modelNativeMeterReceipt, modelSettlementPolicy } from "./model-payment";

const now = new Date("2026-11-12T00:00:00Z");

it("uses frozen customer pricing for native Credits and rejects programmatic funding", () => {
  const original = modelPaymentReservations(createModelPaymentQuote(paymentContext(), now))[0];
  const input = {
    ...original,
    reservation: {
      ...original.reservation,
      estimate: original.reservation.estimate?.filter((q) => q.unit !== "cents"),
      fundingSource: "platform" as const,
      settlementPolicy: { requiredUnits: ["customer_cents"], requireMoney: false },
      scope: { ...original.reservation.scope, connection: "platform:key-1" },
    },
    context: {
      ...original.context,
      connectionId: "platform:key-1",
      publicConnectionId: `platform:${original.reservation.provider}`,
    },
    platformQuote: {
      estimate: [
        decimalQuantity("1", "cents", 4),
        decimalQuantity("2.5", "customer_cents", 4),
        { unit: "requests", value: 1n, scale: 0 },
      ],
      estimateSource: "list" as const,
      costOwner: "platform",
      creditAccountRef: "wallet",
      customerPriceVersion: "customer-v1",
      platformPools: ["global"],
    },
  };
  const prepared = preparePaidAttempt(input);
  expect(prepared.creditAccountRef).toBe("wallet");
  expect(prepared.estimate.find((item) => item.unit === "budget_cents")).toEqual(
    decimalQuantity("2.5", "budget_cents", 4),
  );
  expect(prepared.estimate.some((item) => item.unit === "paid_attempts")).toBe(true);
  expect(() => preparePaidAttempt({ ...input, platformQuote: undefined })).toThrow();
  expect(() =>
    preparePaidAttempt({ ...input, reservation: { ...input.reservation, source: "api" } }),
  ).toThrow();
  expect(() =>
    preparePaidAttempt({
      ...input,
      reservation: { ...input.reservation, provider: "vercel_ai_gateway" },
    }),
  ).toThrow();
});
it("requires exactly the billable dimensions and TTL-specific writes, with optional money", () => {
  const b = binding();
  b.policy.cacheWriteTtls = [300, 3600];
  expect(modelSettlementPolicy(b)).toEqual({
    requiredUnits: [
      "input_tokens",
      "output_tokens",
      "cache_read_input_tokens",
      "cache_write_input_tokens",
      "cache_write_input_tokens_300s",
      "cache_write_input_tokens_3600s",
    ],
    requireMoney: false,
  });
});

it("keeps advisory valuation estimated and never manufactures zero or confirmed money", () => {
  const receipt = createModelUsageReceipt(pricedBinding(), measuredResult());
  const result = modelNativeMeterReceipt(
    { receipt, counted: true, canonicalId: null, proofVersion: 1 },
    now,
  );
  expect(result.cost).toEqual({ certainty: "unknown", money: null });
  expect(result.measurements.find((m) => m.unit === "budget_cents")).toMatchObject({
    certainty: "estimated",
  });
  expect(result.measurements.find((m) => m.unit === "cents")).toMatchObject({
    certainty: "estimated",
  });
  receipt.monetary.total = {
    ...measuredResult().providerCost,
    amount: "2",
    certainty: "estimated",
    basis: "rate_card",
    rateCardVersion: "rates-v1",
  };
  expect(() =>
    modelNativeMeterReceipt({ receipt, counted: true, canonicalId: null, proofVersion: 1 }, now),
  ).toThrow();
});

it.each(["0.0000000013", "0.00012345"])(
  "retains complete provider money at exact scale: %s USD",
  (amount) => {
    const receipt = createModelUsageReceipt(pricedBinding(), reportedResult(amount));
    const result = modelNativeMeterReceipt(
      { receipt, counted: true, canonicalId: null, proofVersion: 1 },
      now,
    );
    const cents = result.measurements.find((m) => m.unit === "cents")?.quantity;
    expect(cents).toBeDefined();
    expect(result.cost).toMatchObject({
      certainty: "measured",
      money: { units: cents?.value, scale: cents?.scale },
    });
  },
);

it("canonical links retain unknown money and no second measurements", () => {
  const receipt = createModelUsageReceipt(binding(), measuredResult());
  const result = modelNativeMeterReceipt(
    { receipt, counted: false, canonicalId: "original", proofVersion: 1 },
    now,
  );
  expect(result).toMatchObject({
    canonicalOperationId: "original",
    measurements: [],
    cost: { certainty: "unknown", money: null },
  });
});

it.each(["openai", "anthropic", "openrouter", "vercel_ai_gateway"] as const)(
  "%s reserves only native own-key units and the advisory budget",
  (provider) => {
    const context = paymentContext();
    context.input.columns[0].providerId = provider;
    context.columns[0].binding.column.providerId = provider;
    const input = modelPaymentReservations(createModelPaymentQuote(context, now))[0];
    const reservation = preparePaidAttempt(input);
    expect(reservation.fundingSource).toBe("byok");
    expect(reservation.estimate.map((q) => q.unit)).toEqual([
      "budget_cents",
      "cents",
      "requests",
      "paid_attempts",
    ]);
    expect(reservation.settlementPolicy?.requireMoney).toBe(false);
    for (const change of [
      { fundingSource: "platform" },
      { creditAccountRef: "wallet" },
      { platformPools: ["pool"] },
      { estimate: [{ unit: "cents", value: 0n, scale: 0 }] },
    ])
      expect(() =>
        preparePaidAttempt({ ...input, reservation: { ...input.reservation, ...change } } as never),
      ).toThrow();
  },
);

it("rejects a connection estimate that disagrees with project valuation", () => {
  const input = modelPaymentReservations(createModelPaymentQuote(paymentContext(), now))[0];
  input.reservation.estimate = input.reservation.estimate?.map((q) =>
    q.unit === "cents" ? { ...q, value: q.value + 1n } : q,
  );
  expect(() => preparePaidAttempt(input)).toThrow("advisory valuation only");
});
