"use client";

import type { LoadDomainHistoryAction } from "@/lib/actions/domain-overview";
import type { DomainHistoryOutcome, DomainOverviewReport } from "@/lib/domain-overview/types";
import { useRef, useState } from "react";
import type {
  DomainOverviewEstimateView,
  DomainOverviewMarketView,
} from "./domain-overview-workspace-model";
import { domainOverviewReportIdentity } from "./domain-overview-workspace-model";

type HistoryRequest = { id: number; identity: string };
type HistoryState = HistoryRequest & { result: Extract<DomainHistoryOutcome, { ok: true }> };

export function useDomainOverviewHistory({
  activeMarket,
  addSpend,
  estimate,
  loadHistoryAction,
  projectId,
  report,
}: Readonly<{
  activeMarket: DomainOverviewMarketView | null;
  addSpend: (costCents: number) => void;
  estimate: DomainOverviewEstimateView;
  loadHistoryAction: LoadDomainHistoryAction;
  projectId: string;
  report: DomainOverviewReport | null;
}>) {
  const identity = domainOverviewReportIdentity(report);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  const requestSequence = useRef(0);
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [historyLoading, setHistoryLoading] = useState<HistoryRequest | null>(null);
  const [historyError, setHistoryError] = useState<HistoryRequest | null>(null);

  async function loadHistory() {
    if (!activeMarket || !report) return;
    const request = { id: ++requestSequence.current, identity };
    setHistoryLoading(request);
    setHistoryError(null);
    try {
      const result = await loadHistoryAction({
        fresh: false,
        languageCode: activeMarket.languageCode,
        locationCode: activeMarket.locationCode,
        maxCostCents: Math.ceil(estimate.historyCostCents ?? 0),
        projectId,
        scopeOverride: report.scope,
        target: report.target,
      });
      addSpend(result.costCents);
      if (latestIdentity.current !== identity || requestSequence.current !== request.id) return;
      if (result.ok) setHistory({ ...request, result });
      else setHistoryError(request);
    } catch {
      if (latestIdentity.current === identity && requestSequence.current === request.id) {
        setHistoryError(request);
      }
    } finally {
      setHistoryLoading((current) => (current?.id === request.id ? null : current));
    }
  }

  return {
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
