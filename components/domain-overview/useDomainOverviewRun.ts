"use client";

import { unresolvedPayment } from "@/components/action-payment/unresolved-payment";
import type { useActionPaymentReview } from "@/components/action-payment/useActionPaymentReview";
import type { AnalyzeDomainOverviewAction } from "@/lib/actions/domain-overview";
import type { DomainOverviewReport, DomainOverviewScope } from "@/lib/domain-overview/types";
import { useState } from "react";
import { type DomainOverviewUiOutcome, reportFrom } from "./domain-overview-workspace-model";

export function useDomainOverviewRun({
  analyzeAction,
  initialOutcome,
  paymentReview,
  requestInput,
  target,
  scope,
  ready,
  addSpend,
  onSuccess,
}: {
  analyzeAction: AnalyzeDomainOverviewAction;
  initialOutcome: DomainOverviewUiOutcome | null;
  paymentReview: ReturnType<typeof useActionPaymentReview>;
  requestInput: (
    target: string,
    scope?: DomainOverviewScope,
  ) => Record<string, unknown> & { projectId: string };
  target: string;
  scope?: DomainOverviewScope;
  ready: boolean;
  addSpend: (value: number) => void;
  onSuccess: (report: DomainOverviewReport) => void;
}) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [failure, setFailure] = useState<Extract<DomainOverviewUiOutcome, { ok: false }> | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  async function analyze(nextTarget = target, fresh = false, nextScope = scope) {
    if (!ready || (unresolved && nextTarget === target)) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const result = await paymentReview.request(
        analyzeAction,
        { ...requestInput(nextTarget, nextScope), fresh },
        nextTarget,
      );
      if (!result) return;
      if ("estimate" in result) return;
      addSpend(result.costCents);
      setUnresolved(unresolvedPayment(result));
      setOutcome((current) => (result.ok || !reportFrom(current) ? result : current));
      if (result.ok) onSuccess(result);
      else setFailure(result);
    } catch {
      const failed = { charged: null, ok: false, reason: "lookup_failed" } as const;
      setUnresolved(true);
      setFailure(failed);
      setOutcome((current) => (reportFrom(current) ? current : failed));
    } finally {
      setSubmitting(false);
    }
  }
  return {
    outcome,
    setOutcome,
    submitting,
    analyze,
    failure,
    unresolved,
    clearUnresolved: () => setUnresolved(false),
  };
}
