"use client";

import { unresolvedPayment } from "@/components/action-payment/unresolved-payment";
import type { useActionPaymentReview } from "@/components/action-payment/useActionPaymentReview";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type { AnalyzeBacklinksAction, AnalyzeBacklinksActionInput } from "@/lib/actions/backlinks";
import {
  type BacklinksFailedSummary,
  type BacklinksSnapshot,
  isBacklinksEstimate,
  isBacklinksFailedSummary,
} from "@/lib/backlinks/types";
import { budgetDenialReason } from "@/lib/metering/budget-denial";
import { useState } from "react";
import type {
  BacklinksAnalyzeRequest,
  BacklinksLimit,
  RecentBacklinksTarget,
} from "./backlinks-workspace-model";

export function useBacklinksRun({
  analyzeAction,
  requestInput,
  target,
  resultLimit,
  paymentReview,
  addSpend,
  rememberTarget,
}: {
  analyzeAction: AnalyzeBacklinksAction;
  requestInput: (
    target: string,
    overrides?: Partial<AnalyzeBacklinksActionInput>,
  ) => AnalyzeBacklinksActionInput;
  target: string;
  resultLimit: BacklinksLimit;
  paymentReview: ReturnType<typeof useActionPaymentReview>;
  addSpend: (value: number) => void;
  rememberTarget: (target: RecentBacklinksTarget) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState<BacklinksSnapshot | null>(null);
  const [failure, setFailure] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const [failurePayment, setFailurePayment] = useState<ActionPaymentReceipt>();
  const [walletBudgetBlocked, setWalletBudgetBlocked] = useState(false);
  const [budgetReason, setBudgetReason] = useState<ReturnType<typeof budgetDenialReason>>();
  const [failedSummary, setFailedSummary] = useState<BacklinksFailedSummary | null>(null);
  function clearResult() {
    setUnresolved(false);
    setSnapshot(null);
    setFailure(false);
    setFailurePayment(undefined);
    setBudgetReason(undefined);
    setWalletBudgetBlocked(false);
    setFailedSummary(null);
  }
  async function analyze(request: BacklinksAnalyzeRequest = {}) {
    setSubmitting(true);
    setFailure(false);
    setFailurePayment(undefined);
    setBudgetReason(undefined);
    setWalletBudgetBlocked(false);
    setFailedSummary(null);
    try {
      const overrides = request.overrides ?? {};
      const nextTarget = request.target ?? target;
      const input = requestInput(nextTarget, { ...overrides, fresh: request.fresh ?? false });
      const outcome =
        request.fallbackOnCostLimit && input.maxCostCents === 0 && !input.fresh
          ? await analyzeAction({ ...input, estimateOnly: false, requirePayment: true })
          : await paymentReview.request(analyzeAction, input, nextTarget, (value, option) => ({
              ...value,
              provider: option.providerId,
              paymentOptionId: option.id,
            }));
      if (!outcome) return;
      setUnresolved(unresolvedPayment(outcome));
      if (isBacklinksFailedSummary(outcome)) {
        setFailedSummary(outcome);
        setFailurePayment(outcome.payment);
        return;
      }
      if (!outcome.ok) {
        setFailurePayment("payment" in outcome ? outcome.payment : undefined);
        setBudgetReason(budgetDenialReason(outcome));
        setWalletBudgetBlocked(outcome.reason === "wallet_budget_exhausted");
        if (
          request.fallbackOnCostLimit &&
          (outcome.reason === "cost_limit_exceeded" || outcome.reason === "payment_quote_required")
        )
          return;
        setFailure(true);
        return;
      }
      if (isBacklinksEstimate(outcome)) {
        setFailure(true);
        return;
      }
      addSpend(outcome.costCents);
      rememberTarget({
        cachedUntil: outcome.cachedUntil,
        fetchedAt: outcome.fetchedAt,
        includeSubdomains: outcome.includeSubdomains,
        provider: outcome.provider,
        resultLimit: overrides.resultLimit ?? resultLimit,
        target: outcome.target,
        targetScope: outcome.targetScope,
        payment: outcome.payment,
        originalPayment: outcome.originalPayment,
      });
      setSnapshot(outcome);
    } catch {
      setUnresolved(true);
      setFailure(true);
    } finally {
      setSubmitting(false);
    }
  }
  return {
    unresolved,
    analyze,
    submitting,
    snapshot,
    setSnapshot,
    failure,
    failurePayment,
    walletBudgetBlocked,
    budgetReason,
    failedSummary,
    clearResult,
  };
}
