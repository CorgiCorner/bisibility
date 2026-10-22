import type { AcceptedActionPayment } from "@/lib/action-payment/contract";
import type { FetchRankedKeywordSuggestionsAction } from "./keyword-ranked-model";

export function rankedPaymentAction(action: FetchRankedKeywordSuggestionsAction) {
  return async (raw: unknown) => {
    const input = raw as {
      projectId: string;
      connectionId?: string;
      offset?: number;
      estimateOnly?: boolean;
      paymentOptionId?: string;
      acceptedPayment?: AcceptedActionPayment;
    };
    const result = await action(input);
    return "reason" in result
      ? { ...result, ok: false as const }
      : { ...result, ok: true as const };
  };
}
