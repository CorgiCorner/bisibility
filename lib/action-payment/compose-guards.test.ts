import { expect, it, vi } from "vitest";
import { composePaymentGuards } from "./compose-guards";

it("preserves definition guards and supplies the actual operationId at both barriers", async () => {
  const order: string[] = [];
  const payment = {
    lockBusiness: vi.fn(async () => {
      order.push("payment-lock");
    }),
    assertRequest: vi.fn(async () => {
      order.push("payment-assert");
    }),
  };
  const guards = composePaymentGuards(
    {
      beforeReserve: {
        lockBusiness: async () => {
          order.push("definition-lock");
        },
        assertRequest: async () => {
          order.push("definition-assert");
        },
      },
      beforeFence: {
        lockBusiness: async () => {
          order.push("fence-lock");
        },
        assertDispatch: async () => {
          order.push("fence-assert");
        },
      },
    },
    payment,
  );
  const tx = {} as never;
  const references = [{ operation: { operationId: "native-operation" } }] as never;
  await guards.beforeReserve.lockBusiness(tx, "native-operation");
  await guards.beforeReserve.assertRequest(tx, "native-operation");
  await guards.beforeFence.lockBusiness(tx, references);
  await guards.beforeFence.assertDispatch(tx, references);
  expect(order).toEqual([
    "definition-lock",
    "payment-lock",
    "definition-assert",
    "payment-assert",
    "fence-lock",
    "payment-lock",
    "fence-assert",
    "payment-assert",
  ]);
  expect(payment.assertRequest).toHaveBeenLastCalledWith(tx, "native-operation");
});
