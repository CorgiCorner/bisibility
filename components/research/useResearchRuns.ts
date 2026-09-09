"use client";

import type {
  ResearchKeywordsAction,
  ResearchKeywordsActionInput,
} from "@/lib/actions/keyword-research";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import {
  type ResearchScope,
  researchScopeForLocationKey,
  researchScopeKey,
} from "@/lib/research/scope";
import { useState } from "react";
import {
  actualResearchCostCents,
  loadDeeperEstimate,
  loadResearchEstimate,
  mapWithConcurrency,
  markTabsSaved,
  markTabsTracked,
  RESEARCH_SEED_CONCURRENCY,
  type ResearchTab,
  researchScopeLocationKey,
  type UiResearchOutcome,
} from "./research-workspace-model";
import type { useRecentSearches } from "./useRecentSearches";

type UseResearchRunsInput = {
  addSpend: (costCents: number) => void;
  connectionId: string;
  includeClickstream: boolean;
  initialBudgetBlocked: boolean;
  scope: ResearchScope;
  mode: KeywordResearchMode;
  projectId: string;
  recent: Pick<ReturnType<typeof useRecentSearches>, "add">;
  researchAction: ResearchKeywordsAction;
  resultLimit: 100 | 300 | 500;
};

export function useResearchRuns({
  addSpend,
  connectionId,
  includeClickstream,
  initialBudgetBlocked,
  scope,
  mode,
  projectId,
  recent,
  researchAction,
  resultLimit,
}: UseResearchRunsInput) {
  const [researching, setResearching] = useState(false);
  const [tabs, setTabs] = useState<ResearchTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [budgetBlocked, setBudgetBlocked] = useState(initialBudgetBlocked);

  function requestInput(
    seed: string,
    overrides: Partial<ResearchKeywordsActionInput> = {},
  ): ResearchKeywordsActionInput {
    const requestedConnectionId = overrides.connectionId ?? connectionId;
    return {
      ...(requestedConnectionId ? { connectionId: requestedConnectionId } : {}),
      includeClickstream: overrides.includeClickstream ?? includeClickstream,
      locationKey: overrides.locationKey ?? researchScopeLocationKey(scope),
      mode: overrides.mode ?? mode,
      projectId,
      resultLimit: overrides.resultLimit ?? resultLimit,
      seed,
      ...overrides,
    };
  }

  async function runResearch(
    nextSeeds: string[],
    overrides: Partial<ResearchKeywordsActionInput> = {},
    runScope: ResearchScope = scope,
  ) {
    setResearching(true);
    try {
      const withLocation = { ...overrides, locationKey: researchScopeLocationKey(runScope) };
      const requestedLimit = (overrides.resultLimit ?? resultLimit) as 100 | 300 | 500;
      const runConnectionId = (overrides.connectionId ?? connectionId) || undefined;
      const runClickstream = overrides.includeClickstream ?? includeClickstream;
      const runMode = (overrides.mode ?? mode) as KeywordResearchMode;
      const perSeed = await mapWithConcurrency(
        nextSeeds,
        RESEARCH_SEED_CONCURRENCY,
        async (seed) => {
          let outcome: UiResearchOutcome;
          try {
            outcome = await researchAction(
              requestInput(seed, { ...withLocation, estimateOnly: false }),
            );
          } catch {
            outcome = { charged: null, ok: false, reason: "lookup_failed" };
          }
          const followupInput = requestInput(seed, withLocation);
          const [deeperEstimate, retryEstimate] = await Promise.all([
            outcome.ok
              ? loadDeeperEstimate(researchAction, followupInput, requestedLimit)
              : undefined,
            outcome.ok ? undefined : loadResearchEstimate(researchAction, followupInput),
          ]);
          return { deeperEstimate, outcome, retryEstimate, seed };
        },
      );
      const nextTabs: ResearchTab[] = [];
      for (const [index, { deeperEstimate, outcome, retryEstimate, seed }] of perSeed.entries()) {
        if (!outcome.ok && outcome.reason === "budget_exhausted") setBudgetBlocked(true);
        if (outcome.ok) {
          addSpend(actualResearchCostCents(outcome));
          recent.add({
            cachedUntil: outcome.cachedUntil,
            connectionId: runConnectionId,
            includeClickstream: runClickstream,
            locationKey: researchScopeLocationKey(runScope),
            scopeLabel: `${runScope.countryName} / ${runScope.languageLabel}`,
            mode: runMode,
            resultLimit: requestedLimit,
            seed,
          });
        }
        nextTabs.push({
          connectionId: runConnectionId,
          deeperEstimate,
          id: `${Date.now()}-${index}`,
          includeClickstream: runClickstream,
          scope: runScope,
          mode: runMode,
          outcome,
          requestedLimit,
          retryEstimate,
          seed,
        });
      }
      setTabs(nextTabs);
      setActiveTabId(nextTabs[0]?.id ?? null);
    } finally {
      setResearching(false);
    }
  }

  function closeTab(id: string) {
    setTabs((current) => current.filter((tab) => tab.id !== id));
    setActiveTabId((current) => (current === id ? null : current));
  }

  function markAdded(keywords: string[], locationKeys: readonly string[]) {
    const selected = new Set(
      locationKeys.map((locationKey) => researchScopeKey(researchScopeForLocationKey(locationKey))),
    );
    setTabs((current) =>
      current.map((tab) =>
        selected.has(researchScopeKey(tab.scope)) ? markTabsTracked([tab], keywords)[0] : tab,
      ),
    );
  }

  function markSaved(keywords: string[], alreadySaved: boolean) {
    setTabs((current) => markTabsSaved(current, keywords, alreadySaved));
  }

  return {
    activeTab: tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    budgetBlocked,
    closeTab,
    markAdded,
    markSaved,
    researching,
    runResearch,
    setActiveTabId,
    tabs,
  };
}
