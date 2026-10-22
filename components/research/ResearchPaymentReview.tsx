"use client";

import { ActionPaymentReview } from "@/components/action-payment/ActionPaymentReview";
import type { useResearchPaymentReview } from "./useResearchPaymentReview";

export function ResearchPaymentReview({
  review,
}: {
  review: ReturnType<typeof useResearchPaymentReview>;
}) {
  if (!review.draft) return null;
  return (
    <ActionPaymentReview
      items={review.draft.items}
      loading={review.draft.loading}
      failed={review.draft.failed}
      assessment={review.draft.assessment}
      onClose={review.close}
      onConfirm={review.confirm}
      onRefresh={review.refresh}
      onOptionChange={(key, id) => void review.changeOption(key, id)}
    />
  );
}
