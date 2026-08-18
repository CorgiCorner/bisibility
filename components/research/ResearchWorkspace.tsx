"use client";

import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { Tooltip } from "@/components/ui";
import type { ResearchKeywordsActionInput } from "@/lib/actions/keyword-research";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import { useState } from "react";
import { RecentResearchSearches } from "./RecentResearchSearches";
import { ResearchResults } from "./ResearchResults";
import { ResearchSearchCard } from "./ResearchSearchCard";
import { ResearchSeedTabs } from "./ResearchSeedTabs";
import { ResearchStatePanel } from "./ResearchStatePanel";
import { ResearchTrackingDrawer } from "./ResearchTrackingDrawer";
import { researchMetricsAvailable } from "./research-market-capability";
import { hasMetricsScopeMismatch, metricsScope } from "./research-metrics-scope";
import {
  focusResearchSeedInput,
  nextBudgetResetLabel,
  type ResearchAddDraft,
  type ResearchWorkspaceProps,
  recentSearchLocation,
  recentSearchReplay,
  researchFailureState,
  researchRetryLabel,
  researchTabRequest,
} from "./research-workspace-model";
import { useRecentSearches } from "./useRecentSearches";
import { useResearchEstimate } from "./useResearchEstimate";
import { useResearchRuns } from "./useResearchRuns";
import { useResearchSavedKeywords } from "./useResearchSavedKeywords";

const BUDGET_BLOCKED_TOOLTIP =
  "Fresh lookups are disabled until the monthly provider budget resets. Cached recent searches remain available.";

export function ResearchWorkspace({
  addKeywordsAction,
  canDeleteSavedKeywords,
  checkHealth,
  context,
  costContext,
  prefill,
  projectMarkets,
  removeSavedKeywordsAction,
  researchAction,
  saveKeywordsAction,
}: Readonly<ResearchWorkspaceProps>) {
  const { addSpend } = useSessionSpend();
  const recent = useRecentSearches(context.project.id);
  const projectLocation = context.location as LocationFieldValue;
  const prefillLocation = prefill?.locationKey
    ? recentSearchLocation(
        {
          locationKey: prefill.locationKey,
          market: prefill.locationKey.split("/").at(-1) ?? prefill.locationKey,
        },
        projectLocation,
      )
    : projectLocation;
  const [connectionId, setConnectionId] = useState(context.connections[0]?.id ?? "");
  const [includeClickstream, setIncludeClickstream] = useState(false);
  const [location, setLocation] = useState(prefillLocation);
  const [mode, setMode] = useState<KeywordResearchMode>("auto");
  const [resultLimit, setResultLimit] = useState<100 | 300 | 500>(100);
  const [seeds, setSeeds] = useState<string[]>(prefill?.seed.trim() ? [prefill.seed.trim()] : []);
  const [addDraft, setAddDraft] = useState<ResearchAddDraft | null>(null);
  const requestInput = (
    seed: string,
    overrides: Partial<ResearchKeywordsActionInput> = {},
  ): ResearchKeywordsActionInput => ({
    connectionId,
    includeClickstream,
    locationKey: location.canonicalKey,
    mode,
    projectId: context.project.id,
    resultLimit,
    seed,
    ...overrides,
  });
  const { estimate, scheduleEstimate } = useResearchEstimate(researchAction, requestInput);
  const researchRuns = useResearchRuns({
    addSpend,
    connectionId,
    includeClickstream,
    initialBudgetBlocked: checkHealth.budget.exhausted,
    location,
    mode,
    projectId: context.project.id,
    recent,
    researchAction,
    resultLimit,
  });
  // biome-ignore format: grouped hook state keeps this page component below the line limit.
  const { activeTab, budgetBlocked, closeTab, markAdded, markSaved, researching, runResearch, setActiveTabId, tabs } = researchRuns;
  const researchAvailable = researchMetricsAvailable(location);
  const savedKeywords = useResearchSavedKeywords({
    canRemove: canDeleteSavedKeywords,
    markSaved,
    projectId: context.project.id,
    removeSavedKeywordsAction,
    saveKeywordsAction,
  });

  function updateSeeds(next: string[]) {
    setSeeds(next);
    scheduleEstimate(researchAvailable ? next : []);
  }

  const hasProvider = context.connections.length > 0;
  const connectionOptions = context.connections.map((connection) => ({
    label: connection.label,
    value: connection.id,
  }));
  const scope = metricsScope(location, context.language.label);

  function openRecentSearch(search: Parameters<typeof recentSearchReplay>[0]) {
    const replay = recentSearchReplay(
      search,
      connectionId,
      context.connections.map((connection) => connection.id),
    );
    if (!replay.connectionId) return;
    const searchLocation = recentSearchLocation(search, projectLocation);
    setMode(search.mode);
    setResultLimit(search.resultLimit);
    setIncludeClickstream(search.includeClickstream);
    setConnectionId(replay.connectionId);
    setLocation(searchLocation);
    if (!researchMetricsAvailable(searchLocation)) {
      setSeeds([search.seed]);
      scheduleEstimate([]);
      return;
    }
    if (replay.cached) {
      void runResearch([search.seed], replay.overrides, searchLocation);
      return;
    }
    setSeeds([search.seed]);
    scheduleEstimate([search.seed], replay.overrides);
  }

  return (
    <section className="grid min-w-0 gap-4">
      {hasProvider ? (
        <Tooltip content={budgetBlocked ? BUDGET_BLOCKED_TOOLTIP : ""}>
          <div>
            <ResearchSearchCard
              connectionId={connectionId}
              connectionOptions={connectionOptions}
              disabled={budgetBlocked}
              estimate={estimate}
              includeClickstream={includeClickstream}
              location={location}
              metricsScope={
                researchAvailable && hasMetricsScopeMismatch(location) ? scope : undefined
              }
              mode={mode}
              onConnectionChange={(value) => {
                setConnectionId(value);
                scheduleEstimate(researchAvailable ? seeds : [], { connectionId: value });
              }}
              onIncludeClickstreamChange={(value) => {
                setIncludeClickstream(value);
                scheduleEstimate(researchAvailable ? seeds : [], { includeClickstream: value });
              }}
              onLimitChange={(value) => {
                setResultLimit(value);
                scheduleEstimate(researchAvailable ? seeds : [], { resultLimit: value });
              }}
              onLocationChange={(value) => {
                setLocation(value);
                scheduleEstimate(researchMetricsAvailable(value) ? seeds : [], {
                  locationKey: value.canonicalKey,
                });
              }}
              lookupDisabled={!researchAvailable}
              onModeChange={(value) => {
                setMode(value);
                scheduleEstimate(researchAvailable ? seeds : [], { mode: value });
              }}
              onSeedsChange={updateSeeds}
              onSubmit={(next) => void runResearch(next)}
              projectId={context.project.id}
              researching={researching}
              resultLimit={resultLimit}
              seeds={seeds}
            />
          </div>
        </Tooltip>
      ) : null}
      <RecentResearchSearches
        disabled={!hasProvider}
        disabledHint="Connect DataForSEO to replay recent searches."
        onOpen={openRecentSearch}
        onRemove={recent.remove}
        searches={recent.searches}
      />
      {!hasProvider ? (
        <ResearchStatePanel projectRef={context.project.id} state="no_provider" />
      ) : null}
      {hasProvider && researching ? (
        <ResearchStatePanel projectRef={context.project.id} state="loading" />
      ) : null}
      {hasProvider && !researching && !activeTab ? (
        <ResearchStatePanel
          projectRef={context.project.id}
          resumeLabel={nextBudgetResetLabel(costContext.timezone ?? "UTC")}
          state={
            budgetBlocked ? "budget_exhausted" : researchAvailable ? "idle" : "unsupported_location"
          }
        />
      ) : null}
      {hasProvider &&
      !researching &&
      activeTab?.outcome.ok &&
      activeTab.outcome.rows.length === 0 ? (
        <ResearchStatePanel
          cached={activeTab.outcome.cached}
          market={activeTab.location.displayName}
          mode={activeTab.mode}
          onEditSearch={focusResearchSeedInput}
          projectRef={context.project.id}
          state="empty"
        />
      ) : null}
      {hasProvider && !researching && activeTab && !activeTab.outcome.ok ? (
        <ResearchStatePanel
          charged={"charged" in activeTab.outcome ? activeTab.outcome.charged : false}
          onRetry={() =>
            void runResearch([activeTab.seed], researchTabRequest(activeTab), activeTab.location)
          }
          projectRef={context.project.id}
          retryLabel={researchRetryLabel(
            activeTab.retryEstimate ?? { cached: false, costCents: null, loading: false },
          )}
          resumeLabel={nextBudgetResetLabel(costContext.timezone ?? "UTC")}
          state={researchFailureState(activeTab.outcome)}
        />
      ) : null}
      <ResearchSeedTabs
        activeId={activeTab?.id}
        onChange={setActiveTabId}
        onClose={closeTab}
        tabs={tabs}
      />
      {hasProvider && !researching && activeTab?.outcome.ok && activeTab.outcome.rows.length > 0 ? (
        <ResearchResults
          costContext={costContext}
          defaultTracking={{
            device: context.defaultMarket.device,
            location: activeTab.location,
            scheduleFrequency: "project_default",
          }}
          deeperEstimate={activeTab.deeperEstimate}
          key={activeTab.id}
          metricsAvailable={researchMetricsAvailable(activeTab.location)}
          onAdd={setAddDraft}
          onDeeper={() => {
            const deeper = activeTab.requestedLimit === 100 ? 300 : 500;
            setResultLimit(deeper);
            void runResearch(
              [activeTab.seed],
              researchTabRequest(activeTab, deeper),
              activeTab.location,
            );
          }}
          onRemoveSaved={
            canDeleteSavedKeywords ? (draft) => void savedKeywords.remove(draft) : undefined
          }
          onSave={(draft) => void savedKeywords.save(draft)}
          requestedLimit={activeTab.requestedLimit}
          result={activeTab.outcome}
          projectId={context.project.id}
          seed={activeTab.seed}
          trackingMarketCount={
            projectMarkets?.markets.filter((market) => market.status === "active").length ?? 0
          }
        />
      ) : null}
      <ResearchTrackingDrawer
        addKeywordsAction={addKeywordsAction}
        costContext={costContext}
        draft={addDraft}
        location={projectLocation}
        onAdded={(created, added) => {
          markAdded(
            created.map((keyword) => keyword.text),
            added.locationKeys,
          );
          setAddDraft(null);
        }}
        onClose={() => setAddDraft(null)}
        project={context.project}
        projectDefaultDevice={context.defaultMarket.device}
        projectMarkets={projectMarkets}
      />
    </section>
  );
}
