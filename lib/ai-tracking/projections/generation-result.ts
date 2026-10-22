import type { ActionFailure, ActionResult } from "@/lib/actions/action-result";
export type TrackingGenerationActionResult<T> =
  | ActionResult<T>
  | {
      ok: false;
      error: ActionFailure & {
        reason: string;
        generationId?: string;
        payment?: import("@/lib/action-payment/contract").ActionPaymentReceipt;
      };
    };
export function unwrapTrackingGenerationActionResult<T>(
  result: TrackingGenerationActionResult<T>,
): T {
  if (result.ok) return result.value;
  throw Object.assign(new Error(result.error.message), result.error);
}
