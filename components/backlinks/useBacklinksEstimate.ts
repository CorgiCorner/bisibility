"use client";

import type { AnalyzeBacklinksAction, AnalyzeBacklinksActionInput } from "@/lib/actions/backlinks";
import { useRef, useState } from "react";
import { type BacklinksEstimateView, EMPTY_BACKLINKS_ESTIMATE } from "./backlinks-workspace-model";

export function useBacklinksEstimate(
  analyzeAction: AnalyzeBacklinksAction,
  requestInput: (
    target: string,
    overrides?: Partial<AnalyzeBacklinksActionInput>,
  ) => AnalyzeBacklinksActionInput,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequence = useRef(0);
  const [estimate, setEstimate] = useState<BacklinksEstimateView>(EMPTY_BACKLINKS_ESTIMATE);

  function scheduleEstimate(target: string, overrides: Partial<AnalyzeBacklinksActionInput> = {}) {
    requestSequence.current += 1;
    const sequence = requestSequence.current;
    if (timer.current) clearTimeout(timer.current);
    if (!target.trim()) {
      setEstimate(EMPTY_BACKLINKS_ESTIMATE);
      return;
    }
    setEstimate({ ...EMPTY_BACKLINKS_ESTIMATE, loading: true });
    timer.current = setTimeout(async () => {
      try {
        const outcome = await analyzeAction(
          requestInput(target, { ...overrides, estimateOnly: true }),
        );
        if (sequence !== requestSequence.current) return;
        setEstimate({
          cached: outcome.ok && outcome.cached,
          costCents: outcome.ok ? (outcome.estimatedCostCents ?? outcome.costCents) : null,
          loading: false,
          valid: true,
        });
      } catch {
        if (sequence !== requestSequence.current) return;
        setEstimate(EMPTY_BACKLINKS_ESTIMATE);
      }
    }, 320);
  }

  return { estimate, scheduleEstimate };
}
