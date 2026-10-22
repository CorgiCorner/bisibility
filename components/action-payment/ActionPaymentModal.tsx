"use client";

import type { ReactNode } from "react";
import { ActionPaymentReview } from "./ActionPaymentReview";
import type { useActionPaymentReview } from "./useActionPaymentReview";

export function ActionPaymentModal({
  review,
  children,
}: {
  children?: ReactNode;
  review: ReturnType<typeof useActionPaymentReview>;
}) {
  const draft = review.draft;
  if (!draft) return null;
  return (
    <ActionPaymentReview
      items={
        draft.quote
          ? [{ key: "action", label: draft.label, quote: draft.quote, options: draft.options }]
          : []
      }
      loading={draft.loading}
      failed={draft.failed}
      assessment={draft.assessment}
      onClose={review.close}
      onConfirm={review.confirm}
      onRefresh={review.refresh}
      onOptionChange={review.selectOption}
    >
      {children}
    </ActionPaymentReview>
  );
}
