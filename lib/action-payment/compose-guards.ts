import type { NativeRequestGuard, PaidFenceHook } from "@/lib/metering/paid-attempt-types";

/** Add consent checks to existing business/definition fencing; never replace its authority. */
export function composePaymentGuards(
  original: { beforeReserve?: NativeRequestGuard; beforeFence?: PaidFenceHook },
  payment: NativeRequestGuard,
) {
  return {
    beforeReserve: {
      async lockBusiness(...args: Parameters<NativeRequestGuard["lockBusiness"]>) {
        await original.beforeReserve?.lockBusiness(...args);
        await payment.lockBusiness(...args);
      },
      async assertRequest(...args: Parameters<NativeRequestGuard["assertRequest"]>) {
        await original.beforeReserve?.assertRequest(...args);
        await payment.assertRequest(...args);
      },
    } satisfies NativeRequestGuard,
    beforeFence: {
      async lockBusiness(tx, references) {
        await original.beforeFence?.lockBusiness(tx, references);
        for (const ref of references) await payment.lockBusiness(tx, ref.operation.operationId);
      },
      async assertDispatch(tx, references) {
        await original.beforeFence?.assertDispatch(tx, references);
        for (const ref of references) await payment.assertRequest(tx, ref.operation.operationId);
      },
    } satisfies PaidFenceHook,
  };
}
