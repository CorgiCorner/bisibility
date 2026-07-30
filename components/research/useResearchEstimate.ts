"use client";

import type {
  ResearchKeywordsAction,
  ResearchKeywordsActionInput,
} from "@/lib/actions/keyword-research";
import type { KeywordResearchSuccess } from "@/lib/keyword-research/types";
import { useRef, useState } from "react";
import { EMPTY_RESEARCH_ESTIMATE } from "./research-workspace-model";

// Debounced server-side estimate for the research button. Estimate-only calls are
// free; the 320ms debounce keeps typing from spamming the action.
export function useResearchEstimate(
  researchAction: ResearchKeywordsAction,
  requestInput: (
    seed: string,
    overrides?: Partial<ResearchKeywordsActionInput>,
  ) => ResearchKeywordsActionInput,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequence = useRef(0);
  const [estimate, setEstimate] = useState(EMPTY_RESEARCH_ESTIMATE);

  function scheduleEstimate(
    nextSeeds: string[],
    overrides: Partial<ResearchKeywordsActionInput> = {},
  ) {
    requestSequence.current += 1;
    const sequence = requestSequence.current;
    if (timer.current) clearTimeout(timer.current);
    if (nextSeeds.length === 0) {
      setEstimate(EMPTY_RESEARCH_ESTIMATE);
      return;
    }
    setEstimate((current) => ({ ...current, loading: true }));
    timer.current = setTimeout(async () => {
      try {
        const outcomes = await Promise.all(
          nextSeeds.map((seed) =>
            researchAction(requestInput(seed, { ...overrides, estimateOnly: true })),
          ),
        );
        const successful = outcomes.filter((item): item is KeywordResearchSuccess => item.ok);
        if (sequence !== requestSequence.current) return;
        setEstimate({
          cached: successful.length === outcomes.length && successful.every((item) => item.cached),
          costCents:
            successful.length === outcomes.length
              ? successful.reduce((sum, item) => sum + item.costCents, 0)
              : null,
          loading: false,
        });
      } catch {
        if (sequence !== requestSequence.current) return;
        setEstimate(EMPTY_RESEARCH_ESTIMATE);
      }
    }, 320);
  }

  return { estimate, scheduleEstimate };
}
