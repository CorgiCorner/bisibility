"use client";

import { unresolvedPayment } from "@/components/action-payment/unresolved-payment";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type { LoadDomainHistoryAction } from "@/lib/actions/domain-overview";
import type { DomainHistoryOutcome, DomainOverviewReport } from "@/lib/domain-overview/types";
import type { ResearchScope } from "@/lib/research/scope";
import { useRef, useState } from "react";
import type { DomainOverviewEstimateView } from "./domain-overview-workspace-model";
import { domainOverviewReportIdentity } from "./domain-overview-workspace-model";
import { domainHistoryPaymentInput } from "./domain-payment-inputs";

type HistoryRequest = { id: number; identity: string };
type HistoryState = HistoryRequest & { result: Extract<DomainHistoryOutcome, { ok: true }> };

export function useDomainOverviewHistory({
  activeResearchScope,
  addSpend,
  loadHistoryAction,
  projectId,
  report,
}: Readonly<{
  activeResearchScope: (ResearchScope & { providerLocationCode: number }) | null;
  addSpend: (costCents: number) => void;
  estimate: DomainOverviewEstimateView;
  loadHistoryAction: (
    input: unknown,
  ) => Promise<Awaited<ReturnType<LoadDomainHistoryAction>> | null>;
  projectId: string;
  report: DomainOverviewReport | null;
}>) {
  const identity = domainOverviewReportIdentity(report);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  const requestSequence = useRef(0);
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [historyLoading, setHistoryLoading] = useState<HistoryRequest | null>(null);
  const [payment, setPayment] = useState<{ identity: string; payment?: ActionPaymentReceipt }>();
  const [blocked, setBlocked] = useState<string>();
  const [historyError, setHistoryError] = useState<HistoryRequest | null>(null);

  async function loadHistory() {
    if (!activeResearchScope || !report || blocked === identity) return;
    const request = { id: ++requestSequence.current, identity };
    setHistoryLoading(request);
    setHistoryError(null);
    try {
      const result = await loadHistoryAction(domainHistoryPaymentInput(projectId, report));
      if (!result) return;
      if ("estimate" in result) {
        setHistoryError(request);
        return;
      }
      addSpend(result.costCents);
      if (latestIdentity.current !== identity || requestSequence.current !== request.id) return;
      if ("payment" in result) setPayment({ identity, payment: result.payment });
      if (unresolvedPayment(result)) setBlocked(identity);
      if (result.ok) setHistory({ ...request, result });
      else setHistoryError(request);
    } catch {
      if (latestIdentity.current === identity && requestSequence.current === request.id) {
        setBlocked(identity);
        setHistoryError(request);
      }
    } finally {
      setHistoryLoading((current) => (current?.id === request.id ? null : current));
    }
  }

  return {
    historyBlocked: blocked === identity,
    historyPayment: payment?.identity === identity ? payment.payment : undefined,
    historyQuoteInput: report ? domainHistoryPaymentInput(projectId, report) : null,
    history: history?.identity === identity ? history.result : null,
    historyError: historyError?.identity === identity,
    historyLoading: historyLoading?.identity === identity,
    loadHistory,
    resetHistory: () => {
      requestSequence.current += 1;
      setHistory(null);
      setHistoryError(null);
      setHistoryLoading(null);
    },
  };
}
