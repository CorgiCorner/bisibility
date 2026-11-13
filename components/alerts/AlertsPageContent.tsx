"use client";

import { AlertFeedRow, isAlertUnread, UnreadSummary } from "@/components/alerts/AlertFeedSections";
import { AlertRulesList } from "@/components/alerts/AlertRulesList";
import {
  AlertsAllClear,
  AlertsCaughtUp,
  AlertsFilteredEmpty,
} from "@/components/alerts/AlertsEmptyStates";
import { AlertsLiveToolbar } from "@/components/alerts/AlertsLiveToolbar";
import { AlertTemplateButtons } from "@/components/alerts/AlertTemplateButtons";
import { alertFeedFacetLabels } from "@/components/alerts/alert-feed-facet-labels";
import {
  filterAlerts,
  presentAlertFeedFacetOptions,
} from "@/components/alerts/alert-feed-presentation";
import { NewRuleAction } from "@/components/alerts/NewRuleAction";
import { FacetBar } from "@/components/feeds/FacetBar";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { markProjectAlertsRead } from "@/lib/actions/alert-feed";
import { appPath } from "@/lib/routing/app-path";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ListMagnifyingGlassIcon as ListMagnifyingGlass } from "@phosphor-icons/react/dist/csr/ListMagnifyingGlass";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { AcknowledgeAllButton } from "./AcknowledgeAllButton";
import { useAlertSnoozes } from "./use-alert-snoozes";

type AlertFilter = "all" | "unread" | "urgent";

import type { AlertsPageContentProps } from "./AlertsPageContent.types";

export type { AlertsPageContentProps } from "./AlertsPageContent.types";

export function AlertsPageContent({
  actions,
  alerts,
  canCreate,
  canDelete,
  canManage,
  canReadAudit,
  canUpdate,
  facetOptions,
  facets = [],
  firedInWindowCount,
  gscConnected,
  gscInstallHref,
  hasTrackedKeywords,
  projectDomain,
  projectId,
  projectRef,
  rules,
  snoozedInWindowCount,
  snoozedAlertIds = [],
  unacknowledgedCount,
  projectName,
  targets,
  templates,
}: Readonly<AlertsPageContentProps>) {
  const t = useTranslations("projectAlerts.feed");
  const router = useRouter();
  const [filter, setFilter] = useState<AlertFilter>("all");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const snoozes = useAlertSnoozes(projectId, snoozedInWindowCount, snoozedAlertIds);
  const format = useFormatter();
  const [feedError, setFeedError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const activeRuleCount = rules.filter((rule) => rule.status === "active").length;
  const liveAlerts = alerts.filter((alert) => !snoozes.ids.has(alert.id));
  const feedQuiet = facets.length === 0 && activeRuleCount > 0 && firedInWindowCount === 0;
  const feedCaughtUp = facets.length === 0 && firedInWindowCount > 0 && liveAlerts.length === 0;
  const feedFilteredEmpty = facets.length > 0 && liveAlerts.length === 0;
  const snoozedCount = snoozes.count;
  const filteredAlerts = filterAlerts(liveAlerts, readIds, filter);
  const shownAlerts = filteredAlerts.slice(0, visibleCount);
  const shownCount = shownAlerts.length;
  const hasMore = visibleCount < filteredAlerts.length;
  const unreadCount = liveAlerts.filter((alert) => isAlertUnread(alert, readIds)).length;
  const urgentCount = liveAlerts.filter((alert) => alert.severity === "urgent").length;
  const resolvedProjectDomain = projectDomain ?? targets.projectDomain;
  const filters = [
    { id: "all", label: t("all"), count: liveAlerts.length },
    { id: "unread", label: t("unread"), count: unreadCount },
    { id: "urgent", label: t("urgent"), count: urgentCount },
  ] satisfies { count: number; id: AlertFilter; label: string }[];
  const localizedFacetOptions = facetOptions
    ? presentAlertFeedFacetOptions(facetOptions, t)
    : undefined;

  async function markAllRead() {
    const previousReadIds = readIds;
    setFeedError(null);
    setReadIds(new Set(liveAlerts.map((alert) => alert.id)));
    try {
      await markProjectAlertsRead({ projectId });
      router.refresh();
    } catch {
      setReadIds(previousReadIds);
      setFeedError(t("markReadError"));
    }
  }

  function snoozeAlert(id: string) {
    setFeedError(null);
    return snoozes.snooze(
      id,
      alerts.find((alert) => alert.id === id)?.keyword ?? t("unknownKeyword"),
    );
  }

  function loadMore() {
    setVisibleCount((count) => Math.min(count + 20, filteredAlerts.length));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4.5">
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
        {localizedFacetOptions ? (
          <FacetBar
            facets={facets}
            labels={alertFeedFacetLabels(t)}
            options={localizedFacetOptions}
          />
        ) : null}
        <AlertsLiveToolbar
          actions={actions}
          canCreate={canCreate}
          canManage={canManage}
          projectDomain={resolvedProjectDomain}
          projectId={projectId}
          targets={targets}
        />
      </div>
      {snoozes.snoozes.map((item) => (
        <p className="m-0 text-xs text-fg-muted" key={item.id} role="status">
          {item.keyword}:{" "}
          {t("snoozedUntil", {
            time: format.dateTime(new Date(item.until), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </p>
      ))}
      {!hasTrackedKeywords ? (
        <AlertBanner
          action={{
            href: appPath(projectRef, "rank-tracker?add=1"),
            icon: "arrow",
            label: t("addKeyword"),
          }}
          detail={t("trackingBlockedDetail")}
          tint="yellow"
          title={t("trackingBlockedTitle")}
        />
      ) : null}
      {feedFilteredEmpty ? (
        <AlertsFilteredEmpty facets={facets} />
      ) : feedQuiet ? (
        <AlertsAllClear
          action={
            canCreate ? (
              <NewRuleAction
                actions={actions}
                canManage={canManage}
                projectDomain={resolvedProjectDomain}
                projectId={projectId}
                targets={targets}
              />
            ) : undefined
          }
          activeRuleCount={activeRuleCount}
        />
      ) : feedCaughtUp ? (
        <AlertsCaughtUp snoozedCount={snoozedCount} />
      ) : (
        <>
          <UnreadSummary alerts={liveAlerts} readIds={readIds} />
          {feedError ? (
            <AlertBanner onDismiss={() => setFeedError(null)} tint="red" title={feedError} />
          ) : null}
          <Card className="overflow-hidden p-0" size="md">
            <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-4.5 py-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <SectionTitle>{t("triggered")}</SectionTitle>
                <span className="rounded-full bg-bg-sunken px-2 py-0.5 font-sans tabular-nums text-[10.5px] font-semibold text-fg-muted">
                  {t("loaded", { count: liveAlerts.length })}
                </span>
                <span className="font-sans tabular-nums text-[11px] text-fg-muted">
                  {t("last48Hours")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  size="toolbar"
                  ariaLabel={t("filterAria")}
                  className="min-w-[220px]"
                  onChange={setFilter}
                  options={filters.map((item) => ({
                    label: (
                      <>
                        {item.label}
                        <span className="font-sans tabular-nums text-[10px] text-fg-muted">
                          {item.count}
                        </span>
                      </>
                    ),
                    value: item.id,
                  }))}
                  value={filter}
                />
                <AcknowledgeAllButton
                  canUpdate={canUpdate}
                  count={unacknowledgedCount ?? unreadCount}
                  onConfirm={markAllRead}
                  projectName={projectName ?? resolvedProjectDomain ?? projectId}
                />
              </div>
            </div>
            {shownAlerts.length > 0 ? (
              shownAlerts.map((alert) => (
                <AlertFeedRow
                  canUpdate={canUpdate}
                  onSnoozed={snoozes.confirm}
                  alert={alert}
                  key={alert.id}
                  onError={setFeedError}
                  onSnooze={snoozeAlert}
                  projectId={projectId}
                  unread={isAlertUnread(alert, readIds)}
                />
              ))
            ) : (
              <div className="px-4.5 py-8 text-center text-[13px] text-fg-muted">{t("empty")}</div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-sunken px-4.5 py-3">
              <span className="font-sans tabular-nums text-[11px] text-fg-muted">
                {t("showing", { shown: shownCount, total: filteredAlerts.length })}
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                {canReadAudit ? (
                  <Link
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-control bg-transparent px-3 text-xs font-semibold text-fg-muted outline-none transition-colors hover:text-accent-text focus-visible:text-accent-text"
                    href={appPath(projectRef, "settings", "audit")}
                  >
                    <ListMagnifyingGlass weight="regular" aria-hidden size={13} />
                    {t("audit")}
                  </Link>
                ) : null}
                <Button
                  disabled={!hasMore}
                  onClick={loadMore}
                  size="sm"
                  startIcon={
                    <ArrowRight weight="regular" aria-hidden className="rotate-90" size={12} />
                  }
                  type="button"
                  variant="secondary"
                >
                  {t("loadMore")}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
      {canCreate ? (
        <section>
          <div className="mb-2.5 font-sans tabular-nums text-[10.5px] uppercase text-fg-muted">
            {t("template")}
          </div>
          <div className="flex flex-wrap gap-2">
            <AlertTemplateButtons
              actions={actions}
              canManage={canManage}
              gscConnected={gscConnected}
              gscInstallHref={gscInstallHref}
              projectDomain={resolvedProjectDomain}
              projectId={projectId}
              targets={targets}
              templates={templates}
            />
          </div>
        </section>
      ) : null}
      <AlertRulesList
        actions={actions}
        canDelete={canDelete}
        canManage={canManage}
        canUpdate={canUpdate}
        projectDomain={resolvedProjectDomain}
        projectId={projectId}
        rules={rules}
        targets={targets}
      />
    </div>
  );
}
