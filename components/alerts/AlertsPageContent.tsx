"use client";

import { AlertFeedRow, isAlertUnread, UnreadSummary } from "@/components/alerts/AlertFeedSections";
import { AlertRulesList } from "@/components/alerts/AlertRulesList";
import { AlertsAllClear, AlertsCaughtUp } from "@/components/alerts/AlertsEmptyStates";
import { AlertsLiveToolbar } from "@/components/alerts/AlertsLiveToolbar";
import { AlertTemplateButtons } from "@/components/alerts/AlertTemplateButtons";
import { NewRuleAction } from "@/components/alerts/NewRuleAction";
import { AlertBanner, Button, Card, SectionTitle, SegmentedControl } from "@/components/ui";
import { markProjectAlertsRead } from "@/lib/actions/alert-feed";
import type {
  AlertActionHandlers,
  AlertRuleView,
  AlertTargetOptions,
  AlertTemplate,
  TriggeredAlertView,
} from "@/lib/alerts/alert-data";
import { pluralize } from "@/lib/format/pluralize";
import { appPath } from "@/lib/routing/app-path";
import {
  ArrowRightIcon as ArrowRight,
  CheckIcon as Check,
  ListMagnifyingGlassIcon as ListMagnifyingGlass,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AlertFilter = "all" | "unread" | "urgent";

export type AlertsPageContentProps = {
  actions: AlertActionHandlers;
  alerts: TriggeredAlertView[];
  canCreate: boolean;
  canDelete: boolean;
  canManage: boolean;
  canReadAudit: boolean;
  canUpdate: boolean;
  firedInWindowCount: number;
  gscConnected: boolean;
  gscInstallHref: string;
  hasTrackedKeywords: boolean;
  projectDomain?: string | null;
  projectId: string;
  projectRef: string;
  rules: AlertRuleView[];
  snoozedInWindowCount: number;
  targets: AlertTargetOptions;
  templates: AlertTemplate[];
};

function filterAlerts(alerts: TriggeredAlertView[], readIds: Set<string>, filter: AlertFilter) {
  if (filter === "unread") {
    return alerts.filter((alert) => isAlertUnread(alert, readIds));
  }
  if (filter === "urgent") {
    return alerts.filter((alert) => alert.severity === "urgent");
  }
  return alerts;
}

export function AlertsPageContent({
  actions,
  alerts,
  canCreate,
  canDelete,
  canManage,
  canReadAudit,
  canUpdate,
  firedInWindowCount,
  gscConnected,
  gscInstallHref,
  hasTrackedKeywords,
  projectDomain,
  projectId,
  projectRef,
  rules,
  snoozedInWindowCount,
  targets,
  templates,
}: Readonly<AlertsPageContentProps>) {
  const router = useRouter();
  const [filter, setFilter] = useState<AlertFilter>("all");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [feedError, setFeedError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const activeRuleCount = rules.filter((rule) => rule.status === "active").length;
  const liveAlerts = alerts.filter((alert) => !dismissedIds.has(alert.id));
  const feedQuiet = activeRuleCount > 0 && firedInWindowCount === 0;
  const feedCaughtUp = firedInWindowCount > 0 && liveAlerts.length === 0;
  const snoozedCount = snoozedInWindowCount + dismissedIds.size;
  const filteredAlerts = filterAlerts(liveAlerts, readIds, filter);
  const shownAlerts = filteredAlerts.slice(0, visibleCount);
  const shownCount = shownAlerts.length;
  const hasMore = visibleCount < filteredAlerts.length;
  const unreadCount = liveAlerts.filter((alert) => isAlertUnread(alert, readIds)).length;
  const urgentCount = liveAlerts.filter((alert) => alert.severity === "urgent").length;
  const resolvedProjectDomain = projectDomain ?? targets.projectDomain;
  const filters = [
    { id: "all", label: "All", count: liveAlerts.length },
    { id: "unread", label: "Unread", count: unreadCount },
    { id: "urgent", label: "Urgent", count: urgentCount },
  ] satisfies { count: number; id: AlertFilter; label: string }[];

  async function markAllRead() {
    const previousReadIds = readIds;
    setFeedError(null);
    setReadIds(new Set(liveAlerts.map((alert) => alert.id)));
    try {
      await markProjectAlertsRead({ projectId });
      router.refresh();
    } catch {
      setReadIds(previousReadIds);
      setFeedError("Could not mark alerts read. Try again.");
    }
  }

  function snoozeAlert(id: string) {
    const previousDismissedIds = dismissedIds;
    setFeedError(null);
    setDismissedIds((current) => new Set(current).add(id));
    return () => setDismissedIds(previousDismissedIds);
  }

  function loadMore() {
    setVisibleCount((count) => Math.min(count + 20, filteredAlerts.length));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4.5">
      <AlertsLiveToolbar
        actions={actions}
        canCreate={canCreate}
        canManage={canManage}
        projectDomain={resolvedProjectDomain}
        projectId={projectId}
        targets={targets}
      />
      {!hasTrackedKeywords ? (
        <AlertBanner
          action={{
            href: appPath(projectRef, "rank-tracker?add=1"),
            icon: "arrow",
            label: "Add keyword",
          }}
          detail="Existing alert configuration and history are preserved, but rules cannot evaluate until a keyword is tracked."
          tint="yellow"
          title="No keywords are currently tracked."
        />
      ) : null}
      {feedQuiet ? (
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
                <SectionTitle>Triggered alerts</SectionTitle>
                <span className="rounded-full bg-bg-sunken px-2 py-0.5 font-mono text-[10.5px] font-semibold text-fg-muted">
                  {liveAlerts.length} loaded
                </span>
                <span className="font-mono text-[11px] text-fg-muted">last 48h</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  ariaLabel="Alert filter"
                  className="min-w-[220px]"
                  onChange={setFilter}
                  optionClassName="min-h-7 flex-row gap-1.5 px-2.5 py-1 text-[11.5px]"
                  options={filters.map((item) => ({
                    label: (
                      <>
                        {item.label}
                        <span className="font-mono text-[10px] text-fg-muted">{item.count}</span>
                      </>
                    ),
                    value: item.id,
                  }))}
                  value={filter}
                />
                <Button
                  disabled={unreadCount === 0}
                  onClick={() => void markAllRead()}
                  size="sm"
                  startIcon={<Check aria-hidden size={13} />}
                  type="button"
                  variant="secondary"
                >
                  Mark all read
                </Button>
              </div>
            </div>
            {shownAlerts.length > 0 ? (
              shownAlerts.map((alert) => (
                <AlertFeedRow
                  alert={alert}
                  key={alert.id}
                  onError={setFeedError}
                  onSnooze={snoozeAlert}
                  projectId={projectId}
                  unread={isAlertUnread(alert, readIds)}
                />
              ))
            ) : (
              <div className="px-4.5 py-8 text-center text-[13px] text-fg-muted">
                No alerts match this filter.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-sunken px-4.5 py-3">
              <span className="font-mono text-[11px] text-fg-muted">
                Showing {shownCount} of {pluralize(filteredAlerts.length, "loaded alert")}
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                {canReadAudit ? (
                  <Link
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-transparent px-3 text-xs font-semibold text-fg-muted outline-none transition-colors hover:text-accent-text focus-visible:text-accent-text"
                    href={appPath(projectRef, "settings", "audit")}
                  >
                    <ListMagnifyingGlass aria-hidden size={13} />
                    View audit log
                  </Link>
                ) : null}
                <Button
                  disabled={!hasMore}
                  onClick={loadMore}
                  size="sm"
                  startIcon={<ArrowRight aria-hidden className="rotate-90" size={12} />}
                  type="button"
                  variant="secondary"
                >
                  Load 20 more
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
      {canCreate ? (
        <section>
          <div className="mb-2.5 font-mono text-[10.5px] uppercase text-fg-muted">
            Create from template
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
