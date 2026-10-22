"use client";
import { useSessionSpend } from "@/components/cost-estimate/SessionSpendProvider";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import { ProviderAccessGate } from "@/components/ui/ProviderAccessGate";
import type { ResearchKeywordsActionInput } from "@/lib/actions/keyword-research";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import {
  researchScopeForStoredLocationKey,
  researchScopeOptionsForProject,
} from "@/lib/research/scope";
import { appPath } from "@/lib/routing/app-path";
import { useState } from "react";
import { RecentResearchSearches } from "./RecentResearchSearches";
import { ResearchPaymentReview } from "./ResearchPaymentReview";
import { ResearchResults } from "./ResearchResults";
import { ResearchSearchCard } from "./ResearchSearchCard";
import { ResearchSeedTabs } from "./ResearchSeedTabs";
import { ResearchTrackingDrawer } from "./ResearchTrackingDrawer";
import { ResearchWorkspaceOutcome } from "./ResearchWorkspaceOutcome";
import { reviewDeeperResearch } from "./research-payment-estimates";
import { researchScopeMetricsAvailable } from "./research-scope-capability";
import {
  type ResearchAddDraft,
  type ResearchWorkspaceProps,
  recentSearchReplay,
  researchScopeLocationKey,
  researchScopeTrackingLocation,
  researchTabRequest,
} from "./research-workspace-model";
import { useRecentSearches } from "./useRecentSearches";
import { useResearchEstimate } from "./useResearchEstimate";
import { useResearchPaymentReview } from "./useResearchPaymentReview";
import { useResearchRequestInput } from "./useResearchRequestInput";
import { useResearchRuns } from "./useResearchRuns";
import { useResearchSavedKeywords } from "./useResearchSavedKeywords";
import { useResearchWorkspaceCopy } from "./useResearchWorkspaceCopy";
export function ResearchWorkspace({
  addKeywordsAction,
  assessPaymentsAction,
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
  const copy = useResearchWorkspaceCopy(costContext.timezone ?? "UTC");
  const recent = useRecentSearches(context.project.id);
  const scopeOptions = researchScopeOptionsForProject([
    context.defaultScope,
    ...(projectMarkets?.markets ?? []),
  ]);
  const prefillScope = prefill?.locationKey
    ? researchScopeForStoredLocationKey(prefill.locationKey, context.defaultScope)
    : context.defaultScope;
  const [connectionId, setConnectionId] = useState(context.connections[0]?.id ?? "");
  const [includeClickstream, setIncludeClickstream] = useState(false);
  const [scope, setScope] = useState(prefillScope);
  const [mode, setMode] = useState<KeywordResearchMode>("auto");
  const [resultLimit, setResultLimit] = useState<100 | 300 | 500>(100);
  const [seeds, setSeeds] = useState<string[]>(prefill?.seed.trim() ? [prefill.seed.trim()] : []);
  const [addDraft, setAddDraft] = useState<ResearchAddDraft | null>(null);
  const { requestInput, selectPaymentOption } = useResearchRequestInput({
    connectionId,
    includeClickstream,
    locationKey: researchScopeLocationKey(scope),
    mode,
    projectId: context.project.id,
    resultLimit,
  });
  const { estimate, scheduleEstimate } = useResearchEstimate(researchAction, requestInput);
  const researchRuns = useResearchRuns({
    addSpend,
    connectionId,
    includeClickstream,
    initialBudgetBlocked: checkHealth.budget.exhausted,
    scope,
    mode,
    projectId: context.project.id,
    recent,
    researchAction,
    resultLimit,
  });
  const {
    activeTab,
    budgetState,
    closeTab,
    markAdded,
    markSaved,
    researching,
    runResearch,
    setActiveTabId,
    tabs,
  } = researchRuns;
  const paymentReview = useResearchPaymentReview(
    researchAction,
    requestInput,
    runResearch,
    assessPaymentsAction,
  );
  const reviewRun = (
    next: string[],
    overrides: Partial<ResearchKeywordsActionInput> = {},
    runScope = scope,
  ) => paymentReview.review(next, overrides, runScope);
  const researchAvailable = researchScopeMetricsAvailable(scope);
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
  const hasResults = Boolean(activeTab?.outcome.ok && activeTab.outcome.rows.length);
  const connectionOptions = context.connections.map(({ label, id: value }) => ({ label, value }));
  function openRecentSearch(search: Parameters<typeof recentSearchReplay>[0]) {
    const replay = recentSearchReplay(
      search,
      connectionId,
      context.connections.map((connection) => connection.id),
    );
    if (!replay.connectionId) return;
    const searchScope = search.locationKey
      ? researchScopeForStoredLocationKey(search.locationKey, context.defaultScope)
      : context.defaultScope;
    setMode(search.mode);
    setResultLimit(search.resultLimit);
    setIncludeClickstream(search.includeClickstream);
    setConnectionId(replay.connectionId);
    setScope(searchScope);
    if (!researchScopeMetricsAvailable(searchScope)) {
      setSeeds([search.seed]);
      scheduleEstimate([]);
      return;
    }
    if (replay.cached) {
      void reviewRun([search.seed], replay.overrides, searchScope);
      return;
    }
    setSeeds([search.seed]);
    scheduleEstimate([search.seed], {
      ...replay.overrides,
      locationKey: researchScopeLocationKey(searchScope),
    });
  }

  const runDeeper = () =>
    activeTab && hasProvider && void reviewDeeperResearch(activeTab, reviewRun, setResultLimit);
  return (
    <section className="grid min-w-0 gap-4">
      <ProviderAccessGate
        blocked={!hasProvider}
        showNotice={hasResults}
        href={appPath(context.project.id, "integrations")}
        providers={context.supportingProviders}
      >
        <div className="w-full">
          <ResearchSearchCard
            connectionId={connectionId}
            connectionOptions={connectionOptions}
            disabled={!hasProvider}
            estimate={estimate}
            includeClickstream={includeClickstream}
            scope={scope}
            scopes={[scope, ...scopeOptions]}
            mode={mode}
            onConnectionChange={(value) => {
              setConnectionId(value);
              selectPaymentOption(undefined);
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
            onScopeChange={(value) => {
              setScope(value);
              scheduleEstimate(researchScopeMetricsAvailable(value) ? seeds : [], {
                locationKey: researchScopeLocationKey(value),
              });
            }}
            lookupDisabled={!hasProvider || !researchAvailable}
            onModeChange={(value) => {
              setMode(value);
              scheduleEstimate(researchAvailable ? seeds : [], { mode: value });
            }}
            onSeedsChange={updateSeeds}
            onPaymentOptionChange={(option) => {
              selectPaymentOption(option);
              scheduleEstimate(seeds, {
                connectionId: option.connectionId,
                paymentOptionId: option.id,
              });
            }}
            onSubmit={(next, option) =>
              void reviewRun(
                next,
                option ? { connectionId: option.connectionId, paymentOptionId: option.id } : {},
              )
            }
            researching={researching}
            resultLimit={resultLimit}
            seeds={seeds}
          />
        </div>
      </ProviderAccessGate>
      <ResearchPaymentReview review={paymentReview} />
      <RecentResearchSearches
        disabled={!hasProvider}
        disabledHint={copy.recentDisabledHint}
        onOpen={openRecentSearch}
        onRemove={recent.remove}
        searches={recent.searches}
      />
      {!hasProvider && !hasResults ? (
        <ProviderAccessEmptyState
          href={appPath(context.project.id, "integrations")}
          providers={context.supportingProviders}
        />
      ) : null}
      {hasProvider ? (
        <ResearchWorkspaceOutcome
          activeTab={activeTab}
          researching={researching}
          projectId={context.project.id}
          scope={scope}
          researchAvailable={researchAvailable}
          budgetState={budgetState}
          copy={copy}
          onRetry={() =>
            activeTab &&
            void reviewRun([activeTab.seed], researchTabRequest(activeTab), activeTab.scope)
          }
        />
      ) : null}
      <ResearchSeedTabs
        activeId={activeTab?.id}
        onChange={setActiveTabId}
        onClose={closeTab}
        tabs={tabs}
      />
      {!researching && activeTab?.outcome.ok && activeTab.outcome.rows.length > 0 ? (
        <ResearchResults
          costContext={costContext}
          defaultTracking={{
            device: context.defaultDevice,
            location: researchScopeTrackingLocation(activeTab.scope),
            scheduleFrequency: "project_default",
          }}
          deeperEstimate={activeTab.deeperEstimate}
          key={activeTab.id}
          metricsAvailable={researchScopeMetricsAvailable(activeTab.scope)}
          onAdd={setAddDraft}
          onDeeper={hasProvider ? runDeeper : undefined}
          onRemoveSaved={
            canDeleteSavedKeywords ? (draft) => void savedKeywords.remove(draft) : undefined
          }
          onSave={(draft) => void savedKeywords.save(draft)}
          requestedLimit={activeTab.requestedLimit}
          result={activeTab.outcome}
          projectId={context.project.id}
          seed={activeTab.seed}
          trackingMarketCount={
            projectMarkets?.markets.filter((entry) => entry.status === "active").length ?? 0
          }
        />
      ) : null}
      <ResearchTrackingDrawer
        addKeywordsAction={addKeywordsAction}
        costContext={costContext}
        draft={addDraft}
        location={researchScopeTrackingLocation(scope)}
        onAdded={(created, added) => {
          markAdded(
            created.map((keyword) => keyword.text),
            added.locationKeys,
          );
          setAddDraft(null);
        }}
        onClose={() => setAddDraft(null)}
        project={context.project}
        projectDefaultDevice={context.defaultDevice}
        projectMarkets={projectMarkets}
      />
    </section>
  );
}
