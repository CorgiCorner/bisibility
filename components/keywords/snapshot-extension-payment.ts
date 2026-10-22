import type { AcceptedActionPayment } from "@/lib/action-payment/contract";
import type {
  ExtendSnapshotAction,
  PreviewSnapshotExtensionAction,
  SnapshotExtensionInput,
} from "@/lib/serp/snapshot-extension";

export function snapshotExtensionPaymentAction(
  preview: PreviewSnapshotExtensionAction,
  execute: ExtendSnapshotAction,
  scope: Omit<SnapshotExtensionInput, "paymentOptionId">,
) {
  return async (raw: unknown) => {
    const request = raw as SnapshotExtensionInput & {
      estimateOnly?: boolean;
      acceptedPayment?: AcceptedActionPayment;
    };
    const input = { ...scope, paymentOptionId: request.paymentOptionId };
    if (request.estimateOnly) return { ...(await preview(input)), estimate: true as const };
    return execute({ ...input, acceptedPayment: request.acceptedPayment });
  };
}
