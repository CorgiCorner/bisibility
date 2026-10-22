import type { useActionPaymentReview } from "@/components/action-payment/useActionPaymentReview";
import type { LoadMoreBacklinkRowsAction } from "@/lib/actions/backlinks";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import type { Dispatch, SetStateAction } from "react";

export async function loadMoreWorkspaceRows(
  action: (
    input: Parameters<LoadMoreBacklinkRowsAction>[0],
  ) => Promise<Awaited<ReturnType<LoadMoreBacklinkRowsAction>> | null>,
  projectId: string,
  current: BacklinksSnapshot,
  addSpend: (cost: number) => void,
  setSnapshot: Dispatch<SetStateAction<BacklinksSnapshot | null>>,
) {
  const outcome = await action(backlinksAppendInput(projectId, current));
  if (outcome?.ok && !("estimate" in outcome)) {
    addSpend(outcome.costCents);
    setSnapshot((visible) =>
      visible && visible.snapshotRef === current.snapshotRef
        ? {
            ...visible,
            snapshotRef: outcome.snapshotRef,
            appendPayment: outcome.payment,
            fetchedRowCount: outcome.fetchedRowCount,
            totalRowsAvailable: outcome.totalRowsAvailable,
            rows: [...visible.rows, ...outcome.rows],
          }
        : visible,
    );
  }
  return outcome;
}

export function backlinksAppendInput(projectId: string, current: BacklinksSnapshot) {
  return {
    includeSubdomains: current.includeSubdomains,
    limit: 100,
    snapshotRef: current.snapshotRef,
    projectId,
    provider: current.provider,
    target: current.target,
    targetScope: current.targetScope,
    paymentOptionId: current.payment?.option.id ?? current.originalPayment?.option.id,
  };
}

export function backlinksRefreshInput(
  projectId: string,
  current: BacklinksSnapshot,
  resultLimit: 100 | 300 | 500 | 1000,
) {
  return {
    projectId,
    target: current.target,
    targetScope: current.targetScope,
    includeSubdomains: current.includeSubdomains,
    provider: current.provider,
    paymentOptionId: current.payment?.option.id ?? current.originalPayment?.option.id,
    mode: "as_is" as const,
    resultLimit,
    fresh: true,
  };
}

export function reviewedBacklinksAppendAction(
  review: ReturnType<typeof useActionPaymentReview>,
  action: LoadMoreBacklinkRowsAction,
  target: string,
) {
  return (input: Parameters<LoadMoreBacklinkRowsAction>[0]) =>
    review.request(
      action,
      input as Record<string, unknown> & { projectId: string },
      target,
      (value, option) => ({ ...value, provider: option.providerId, paymentOptionId: option.id }),
    );
}
