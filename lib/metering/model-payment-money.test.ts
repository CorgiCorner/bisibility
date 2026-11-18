import { createModelUsageReceipt } from "@/lib/model-playground/usage";
import { measuredResult, pricedBinding } from "@/lib/model-playground/usage.test-support";
import { expect, it, vi } from "vitest";
import { modelNativeMeterReceipt } from "./model-payment";

// Exercise the money boundary independently of the upstream receipt validator.
vi.mock("@/lib/model-playground/usage", async (original) => ({
  ...(await original<typeof import("@/lib/model-playground/usage")>()),
  validateModelUsageReceipt: (receipt: unknown) => receipt,
}));
it("never measures an estimated total even if an upstream validator admits it", () => {
  const receipt = createModelUsageReceipt(pricedBinding(), measuredResult());
  receipt.monetary.total = {
    amount: "0.12",
    currency: "USD",
    certainty: "estimated",
    basis: "rate_card",
    rateCardVersion: "rates-v1",
  };
  const result = modelNativeMeterReceipt(
    { receipt, counted: true, canonicalId: null, proofVersion: 1 },
    new Date(),
  );
  expect(result.measurements.filter((m) => m.unit === "cents")).toEqual([
    expect.objectContaining({ unit: "cents", certainty: "estimated" }),
  ]);
  expect(result.cost).toEqual({ certainty: "unknown", money: null });
});
