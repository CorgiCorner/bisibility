"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { track } from "@/lib/analytics/client";
import { formatDateLabel } from "@/lib/search-insights/dates";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { SearchInsightsDrawerHost } from "./drawers/SearchInsightsDrawerHost";
import { SearchInsightsActions } from "./SearchInsightsActions";
import {
  type ArchivedActivationTarget,
  SearchInsightsArchivedActivation,
} from "./SearchInsightsArchivedActivation";
import { SearchInsightsContextCard } from "./SearchInsightsContextCard";
import {
  SearchInsightsBodyLoading,
  SearchInsightsTrustStripLoading,
} from "./SearchInsightsLoadingSkeletons";
import { SearchInsightsOauthReturn } from "./SearchInsightsOauthReturn";
import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";
import { SearchInsightsPropertyPicker } from "./SearchInsightsPropertyPicker";
import type { SearchInsightsWorkspaceProps } from "./search-insights-workspace-model";

export function SearchInsightsWorkspace({
  cancelPropertySelectionAction,
  children,
  completePropertySelectionAction,
  context,
  disconnectConnectionAction,
  drawers,
  exportAction,
  loadPropertiesAction,
  oauth,
  projectDomain,
  projectId,
  selectPropertyAction,
  syncAction,
  syncPlan,
  trustStrip,
}: Readonly<SearchInsightsWorkspaceProps>) {
  const dateFormat = useDateFormat();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [periodPending, startPeriodTransition] = useTransition();

  function changePeriod(id: string) {
    if (id === context.period.id || periodPending) return;
    const next = new URLSearchParams(searchParams);
    next.set("period", id);
    track("search_insights_period_changed", { window: id });
    // Keep the URL as the source of truth and cover the server read with the workspace skeletons.
    startPeriodTransition(() =>
      router.replace(`${pathname}?${next.toString()}`, { scroll: false }),
    );
  }

  const viewed = useRef(false);
  const [activationTarget, setActivationTarget] = useState<ArchivedActivationTarget | null>(null);
  // This guarded render pattern follows the existing local ref guards and emits once per mount.
  if (!viewed.current) {
    viewed.current = true;
    track("search_insights_module_viewed");
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {context.connection.property ? (
        <SearchInsightsContextCard
          trustStrip={
            periodPending && trustStrip ? <SearchInsightsTrustStripLoading /> : trustStrip
          }
        >
          <SearchInsightsPropertyPicker
            key={`${projectId}:${context.connection.property.value}`}
            connection={context.connection}
            loadPropertiesAction={loadPropertiesAction}
            projectDomain={projectDomain}
            projectId={projectId}
            preserveGa4OauthSelection={oauth.provider === "ga4" && oauth.setup?.provider === "ga4"}
            selectPropertyAction={selectPropertyAction}
            syncPlan={syncPlan}
            viewedProperty={context.selectedProperty}
          />
          {context.window ? (
            <>
              <SearchInsightsPeriodMenu
                dateFormat={dateFormat}
                importFacts={context.importState?.facts}
                onPeriodChange={changePeriod}
                pending={periodPending}
                period={context.period}
                window={context.window}
              />
              <SearchInsightsActions
                exportAction={exportAction}
                importState={context.importState}
                hasProperty
                period={context.period.id}
                projectId={projectId}
                queryCount={context.counts.queries}
                readOnly={context.view === "archived"}
                syncAction={syncAction}
              />
            </>
          ) : null}
        </SearchInsightsContextCard>
      ) : null}
      {context.view === "archived" &&
      context.selectedProperty &&
      context.importState?.finalizedThroughDate ? (
        <InlineCallout className="items-center" contentClassName="flex-1" tint="neutral">
          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1">
              Archived - not syncing. Data ends{" "}
              {formatDateLabel(context.importState.finalizedThroughDate, dateFormat)}.
            </span>
            <Button
              onClick={() =>
                setActivationTarget({
                  displayName: context.selectedProperty?.displayName ?? "this property",
                  lastSyncedDate: context.importState?.finalizedThroughDate ?? "",
                  value: context.selectedProperty?.value ?? "",
                })
              }
              className="shrink-0"
              size="xs"
              variant="secondary"
            >
              Change to active
            </Button>
          </span>
        </InlineCallout>
      ) : null}
      <SearchInsightsArchivedActivation
        currentDisplayName={context.connection.property?.displayName ?? "current property"}
        onClose={() => setActivationTarget(null)}
        projectId={projectId}
        selectPropertyAction={selectPropertyAction}
        target={activationTarget}
      />
      {oauth.error && oauth.provider !== "ga4" ? (
        <InlineCallout tint="yellow">
          <span>{oauth.error}</span>
        </InlineCallout>
      ) : null}
      {/* The consent screen came back here, so the property choice is finished here. */}
      {periodPending ? (
        <SearchInsightsBodyLoading />
      ) : oauth.setup && oauth.provider !== "ga4" ? (
        <div className="flex min-h-[calc(100dvh-18rem)] items-center justify-center">
          <SearchInsightsOauthReturn
            cancelAction={cancelPropertySelectionAction}
            completeAction={completePropertySelectionAction}
            disconnectAction={disconnectConnectionAction}
            projectId={projectId}
            setup={oauth.setup}
            syncPlan={syncPlan}
          />
        </div>
      ) : drawers ? (
        <SearchInsightsDrawerHost
          key={`${projectId}:${drawers.property}:${drawers.period}`}
          {...drawers}
        >
          {children}
        </SearchInsightsDrawerHost>
      ) : (
        children
      )}
    </div>
  );
}
