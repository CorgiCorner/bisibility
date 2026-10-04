"use client";

import type { AnalyzeBacklinksAction, AnalyzeBacklinksActionInput } from "@/lib/actions/backlinks";
import { isBacklinksEstimate } from "@/lib/backlinks/types";
import { useRef, useState } from "react";
import { type BacklinksEstimateView, EMPTY_BACKLINKS_ESTIMATE } from "./backlinks-workspace-model";

export function useBacklinksEstimate(
  analyzeAction: AnalyzeBacklinksAction,
  requestInput: (
    target: string,
    overrides?: Partial<AnalyzeBacklinksActionInput>,
  ) => AnalyzeBacklinksActionInput,
  initialEstimate: BacklinksEstimateView = EMPTY_BACKLINKS_ESTIMATE,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequence = useRef(0);
  const [estimate, setEstimate] = useState<BacklinksEstimateView>(initialEstimate);

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
        const dryRun = outcome.ok && isBacklinksEstimate(outcome) ? outcome : null;
        setEstimate({
          cached: dryRun?.cached ?? false,
          costCents: dryRun?.estimatedCostCents ?? null,
          loading: false,
          valid: outcome.ok || outcome.reason !== "unsupported_target",
        });
      } catch {
        if (sequence !== requestSequence.current) return;
        setEstimate(EMPTY_BACKLINKS_ESTIMATE);
      }
    }, 320);
  }

  return { estimate, scheduleEstimate };
}
