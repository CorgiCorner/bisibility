"use client";

import type { AnalyzeDomainOverviewAction } from "@/lib/actions/domain-overview";
import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import { useRef, useState } from "react";
import {
  type DomainOverviewEstimateView,
  EMPTY_DOMAIN_OVERVIEW_ESTIMATE,
  estimateView,
} from "./domain-overview-workspace-model";

export function useDomainOverviewEstimate(
  action: AnalyzeDomainOverviewAction,
  requestInput: (
    target: string,
    scopeOverride?: DomainOverviewScope,
  ) => Parameters<AnalyzeDomainOverviewAction>[0],
  initial: DomainOverviewEstimateView,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const [estimate, setEstimate] = useState(initial);

  function scheduleEstimate(target: string, scopeOverride?: DomainOverviewScope) {
    sequence.current += 1;
    const request = sequence.current;
    if (timer.current) clearTimeout(timer.current);
    if (!target.trim()) {
      setEstimate(EMPTY_DOMAIN_OVERVIEW_ESTIMATE);
      return;
    }
    setEstimate({ ...EMPTY_DOMAIN_OVERVIEW_ESTIMATE, loading: true });
    timer.current = setTimeout(async () => {
      try {
        const outcome = await action(requestInput(target, scopeOverride));
        if (request === sequence.current) setEstimate(estimateView(outcome));
      } catch {
        if (request === sequence.current) setEstimate(EMPTY_DOMAIN_OVERVIEW_ESTIMATE);
      }
    }, 320);
  }

  return { estimate, scheduleEstimate, setEstimate };
}
