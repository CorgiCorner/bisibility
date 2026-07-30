"use client";

import { AddCompetitorAction } from "@/components/competitors/AddCompetitorAction";
import { ComparisonScopeDrawer } from "@/components/competitors/ComparisonScopeDrawer";
import { CompetitorSavedViewsControl } from "@/components/competitors/CompetitorSavedViewsControl";
import { CompetitorScopeControls } from "@/components/competitors/CompetitorScopeControls";
import { HeadToHeadTable } from "@/components/competitors/HeadToHeadTable";
import { ShareOfVoiceCard } from "@/components/competitors/ShareOfVoiceCard";
import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import { AddKeywordDrawer } from "@/components/keywords/add/AddKeywordDrawer";
import { Button, EmptyState } from "@/components/ui";
import { downloadCompetitorMarketCsv } from "@/lib/competitors/competitor-csv";
import { buildCompetitorMarket } from "@/lib/competitors/competitor-market-model";
import { useCompetitorDraft } from "@/lib/competitors/draft-store";
import {
  type CompetitorSavedViewConfig,
  competitorSavedViewHref,
} from "@/lib/competitors/saved-view-model";
import type { CompetitorFilter, CompetitorsViewModel } from "@/lib/competitors/types";
import type { DeleteSavedViewInput } from "@/lib/keywords/saved-view-model";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import type {
  CompetitorSavedView,
  CreateProjectSavedViewInput,
  SavedViewResource,
} from "@/lib/saved-views/model";
import {
  ArrowRightIcon as ArrowRight,
  ExportIcon as Export,
  FunnelSimpleIcon as FunnelSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type CompetitorsWorkspaceProps = Partial<Pick<KeywordWorkspaceActions, "addKeywordsAction">> & {
  activeViewId: string | null;
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  createSavedViewAction?: (input: CreateProjectSavedViewInput) => Promise<SavedViewResource>;
  deletableSavedViewIds: readonly string[];
  deleteSavedViewAction?: (input: DeleteSavedViewInput) => Promise<unknown>;
  initialFilter: CompetitorFilter;
  projectRef: ProjectRef;
  savedViews: CompetitorSavedView[];
  view: CompetitorsViewModel;
};

export function CompetitorsWorkspace({
  activeViewId,
  addKeywordsAction,
  canCreate,
  canDelete,
  canUpdate,
  createSavedViewAction,
  deletableSavedViewIds,
  deleteSavedViewAction,
  initialFilter,
  projectRef,
  savedViews,
  view,
}: Readonly<CompetitorsWorkspaceProps>) {
  const router = useRouter();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const rawMarket = view.market;
  const draftKey = `competitors:${view.projectId}:${rawMarket?.key ?? "invalid"}:${activeViewId ?? "base"}`;
  const draft = useCompetitorDraft(draftKey, initialFilter);
  const activeFilter = useMemo(() => {
    if (!rawMarket) return initialFilter;
    const validIds = new Set(rawMarket.observations.map((observation) => observation.id));
    const activeTag =
      draft.filter.tag && rawMarket.tags.includes(draft.filter.tag) ? draft.filter.tag : null;
    return {
      excludedKeywordIds: draft.filter.excludedKeywordIds.filter((id) => validIds.has(id)),
      position: draft.filter.position,
      tag: activeTag,
    } satisfies CompetitorFilter;
  }, [draft.filter, initialFilter, rawMarket]);
  const market = useMemo(
    () => (rawMarket ? buildCompetitorMarket(rawMarket, activeFilter) : null),
    [activeFilter, rawMarket],
  );

  if (view.managedCompetitors.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col">
        <EmptyState
          action={
            canCreate ? (
              <AddCompetitorAction
                canCreate
                projectId={view.projectId}
                suggestions={view.suggestions}
              />
            ) : undefined
          }
          description="Add at least one managed competitor before benchmarking share of voice and head-to-head ranks."
          title="No managed competitors"
        />
      </div>
    );
  }

  if (view.markets.length === 0) {
    const competitorNames = view.managedCompetitors
      .map((competitor) => competitor.label)
      .join(", ");
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-border-strong bg-bg-elev px-[18px] text-[13.5px] font-semibold text-fg hover:border-accent hover:text-accent"
            href={appPath(projectRef, "keywords")}
          >
            Add keywords first
            <ArrowRight aria-hidden size={14} weight="bold" />
          </Link>
        }
        description={`${view.managedCompetitors.length} managed competitor${view.managedCompetitors.length === 1 ? "" : "s"} (${competitorNames}) saved. Track at least one keyword before benchmarking.`}
        title="No tracked keywords"
      />
    );
  }

  const requestedLocation = view.scope
    ? view.markets.find((market) => market.locationId === view.scope?.locationId)
    : null;
  const requestedScope = view.scope;
  if (!rawMarket || !requestedScope || !market) {
    return (
      <div className="grid gap-5">
        <CompetitorScopeControls
          markets={view.markets}
          projectRef={projectRef}
          scope={view.scope}
          viewId={activeViewId}
        />
        <EmptyState
          action={
            requestedLocation && addKeywordsAction ? (
              <Button onClick={() => setTrackOpen(true)}>Track this market</Button>
            ) : undefined
          }
          description="This exact location and device combination is not tracked yet. Choose an available market or add keywords for this scope."
          title="Market not tracked"
        />
        {trackOpen && requestedLocation && requestedScope && addKeywordsAction ? (
          <AddKeywordDrawer
            addKeywordsAction={addKeywordsAction}
            defaultDevice={requestedScope.device}
            defaultLocation={requestedLocation.location}
            defaultLocationSelection={{
              canonicalKey: requestedLocation.canonicalKey,
              cityName: requestedLocation.cityName,
              countryCode: requestedLocation.countryCode,
              displayName: requestedLocation.location,
              hl: requestedLocation.hl,
              kind: requestedLocation.locationKind,
              languageLabel: requestedLocation.languageLabel,
              regionName: requestedLocation.regionName,
            }}
            onClose={() => setTrackOpen(false)}
            open
            projectId={view.projectId}
          />
        ) : null}
      </div>
    );
  }

  const config: CompetitorSavedViewConfig = {
    filters: activeFilter,
    scope: requestedScope,
    surface: "competitors",
    version: 1,
  };
  const activeSavedView = savedViews.find((savedView) => savedView.id === activeViewId) ?? null;
  const scopeModified = Boolean(
    activeSavedView &&
      (activeSavedView.config.scope.device !== config.scope.device ||
        activeSavedView.config.scope.engine !== config.scope.engine ||
        activeSavedView.config.scope.locationId !== config.scope.locationId),
  );

  function discardChanges() {
    draft.clear();
    if (scopeModified && activeSavedView) {
      router.push(competitorSavedViewHref(projectRef, activeSavedView.id, activeSavedView.config));
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CompetitorScopeControls
          markets={view.markets}
          projectRef={projectRef}
          scope={view.scope}
          viewId={activeViewId}
        />
        <div className="flex flex-wrap items-center gap-2">
          <CompetitorSavedViewsControl
            activeViewId={activeViewId}
            config={config}
            createSavedViewAction={createSavedViewAction}
            deletableSavedViewIds={deletableSavedViewIds}
            deleteSavedViewAction={deleteSavedViewAction}
            modified={draft.modified || scopeModified}
            onDiscard={discardChanges}
            onSaved={draft.clear}
            projectId={view.projectId}
            projectRef={projectRef}
            savedViews={savedViews}
          />
          <Button
            onClick={() => setScopeOpen(true)}
            size="sm"
            startIcon={<FunnelSimple aria-hidden size={13} />}
            variant="secondary"
          >
            Comparison scope
          </Button>
          <Button
            onClick={() => downloadCompetitorMarketCsv(market)}
            size="sm"
            startIcon={<Export aria-hidden size={13} />}
            variant="secondary"
          >
            Export
          </Button>
          {canCreate ? (
            <AddCompetitorAction
              canCreate
              projectId={view.projectId}
              suggestions={view.suggestions}
            />
          ) : null}
        </div>
      </div>

      <ShareOfVoiceCard
        canDelete={canDelete}
        canUpdate={canUpdate}
        filter={activeFilter}
        market={market}
        onFilterChange={draft.setFilter}
        projectId={view.projectId}
      />
      <HeadToHeadTable
        key={`${market.key}:${activeFilter.position}:${activeFilter.tag ?? "all"}:${activeFilter.excludedKeywordIds.join(",")}`}
        market={market}
        onExport={() => downloadCompetitorMarketCsv(market)}
      />
      <ComparisonScopeDrawer
        filter={activeFilter}
        market={rawMarket}
        onChange={draft.setFilter}
        onClose={() => setScopeOpen(false)}
        open={scopeOpen}
      />
    </div>
  );
}
