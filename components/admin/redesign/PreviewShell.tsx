"use client";
import { AdminScrollNav } from "@/components/admin/pages/AdminScrollNav";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { appRootPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useState } from "react";
import type { OssScreen } from "./OssPreviewData";
import { type PreviewDestination, PreviewNavigationContext } from "./PreviewNavigationContext";

export type PreviewNavigation = Record<string, readonly string[]>;
export const ossNavigation = {
  Overview: ["Status"],
  Operations: ["Worker", "Checks", "Data sources", "Tasks", "Notifications"],
  Users: ["Accounts"],
  Email: ["Sending today", "Settings"],
  Audit: ["Audit"],
} as const satisfies PreviewNavigation;

export const coreNavigation = ossNavigation;

function OssPreviewMetrics({ screen }: { screen: OssScreen }) {
  if (screen.metrics.length === 0) return null;
  return (
    <section aria-label={screen.question} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
      {screen.metrics.map((metric) => (
        <Card key={metric.label} size="lg" className="min-w-0">
          <h3 className="text-xs font-medium text-fg-muted">{metric.label}</h3>
          <p
            className={`mt-2 ${/^[\d$]/.test(metric.value) ? "text-xl font-semibold tabular-nums" : "text-sm text-fg-muted"}`}
          >
            {metric.value}
          </p>
          {metric.detail && <p className="mt-1 text-xs text-fg-muted">{metric.detail}</p>}
        </Card>
      ))}
    </section>
  );
}

function OssPreviewDetails({ screen }: { screen: OssScreen }) {
  if (screen.details.length === 0) return null;
  return (
    <Card component="section" size="lg">
      <h3 className="text-sm font-semibold">Details</h3>
      <dl className="mt-3 divide-y divide-border-soft">
        {screen.details.map(({ label, value }) => (
          <div className="flex flex-wrap justify-between gap-2 py-2 text-[13px]" key={label}>
            <dt>{label}</dt>
            <dd className="m-0 text-fg-muted">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function OssPreviewScreen({ screen }: { screen: OssScreen }) {
  return (
    <>
      <OssPreviewMetrics screen={screen} />
      <OssPreviewDetails screen={screen} />
    </>
  );
}

export function PreviewShell({
  navigation,
  initialTab = "Overview",
  initialView,
  viewLabel,
  refresh,
  children,
}: {
  navigation: PreviewNavigation;
  initialTab?: string;
  initialView?: string;
  viewLabel?: (view: string) => string | undefined;
  refresh?: { onRefresh: () => void; refreshing?: boolean; refreshedAt?: string; error?: string };
  children: (tab: string, view: string, label: string) => ReactNode;
}) {
  const t = useTranslations("instanceAdmin");
  const dateDisplay = useDateDisplay();
  const navLabels: Record<string, string> = {
    Overview: t("navigation.overview"),
    "Usage & costs": t("navigation.usageCosts"),
    Operations: t("navigation.operations"),
    Users: t("navigation.users"),
    Revenue: t("navigation.revenue"),
    Email: t("navigation.email"),
    Audit: t("navigation.audit"),
    Status: t("shell.status"),
    Accounts: t("shell.accounts"),
    Settings: t("shell.settings"),
    "Sending today": t("shell.sendingToday"),
    Worker: t("shell.worker"),
    Checks: t("shell.checks"),
    "Data sources": t("shell.dataSources"),
    Tasks: t("shell.tasks"),
    Notifications: t("shell.notifications"),
    Journey: t("shell.journey"),
    Retention: t("shell.retention"),
    Survey: t("shell.survey"),
    Signups: t("shell.signups"),
    Subscriptions: t("shell.subscriptions"),
    Trials: t("shell.trials"),
    Credits: t("shell.credits"),
    Billing: t("shell.billing"),
    "Hosted providers": t("shell.hostedProviders"),
    "Provider credits": t("shell.providerCredits"),
    "Analytics exclusions": t("shell.analyticsExclusions"),
    Summary: t("shell.summary"),
    Ledger: t("shell.ledger"),
    Budgets: t("shell.budgets"),
    Metering: t("shell.meteringView"),
    "AI engine": t("shell.aiEngine"),
    "Accounting health": t("shell.accountingHealth"),
    Announcements: t("shell.announcements"),
  };
  const [tab, setTab] = useState(initialTab);
  const [view, setView] = useState(initialView ?? navigation[initialTab][0]);
  const navigate = useCallback(
    (destination: PreviewDestination) => {
      const target = Object.entries(navigation).find(([, views]) => views.includes(destination));
      if (target) {
        setTab(target[0]);
        setView(destination);
      }
    },
    [navigation],
  );
  return (
    <PreviewNavigationContext value={navigate}>
      <div className="min-h-screen bg-bg text-fg">
        <header className="border-b border-border bg-bg-elev px-4 sm:px-[26px]">
          <div className="flex min-h-[60px] items-center gap-2.5">
            <BrandLockup className="sm:hidden" markOnly />
            <BrandLockup className="hidden sm:inline-flex" />
            <span className="hidden text-[11px] uppercase tracking-[0.5px] text-fg-muted md:inline">
              {t("shell.context")}
            </span>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {refresh && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={refresh.refreshing}
                    onClick={refresh.onRefresh}
                  >
                    {refresh.refreshing ? t("shell.refreshing") : t("shell.refreshData")}
                  </Button>
                  {refresh.error && (
                    <span role="status" className="text-xs text-fg-muted">
                      {refresh.error}
                    </span>
                  )}
                  {refresh.refreshedAt && (
                    <span className="text-xs text-fg-muted">
                      {t("shell.refreshed", { time: refresh.refreshedAt })}
                    </span>
                  )}
                </>
              )}
              <a
                className="shrink-0 text-xs font-semibold text-fg-muted hover:text-fg"
                href={appRootPath()}
              >
                {t("shell.backToApp")}
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto grid min-w-0 w-full max-w-[1180px] grid-cols-1 gap-4 px-4 pt-7 pb-20 sm:px-[26px] sm:pt-[30px]">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.7px]">{t("shell.title")}</h1>
            <p className="mt-1.5 text-[13px] text-fg-muted">
              {t("shell.previewDescription")}{" "}
              {t("dashboard.timeZone", { timeZone: dateDisplay.timeZone })}
            </p>
          </div>
          <AdminScrollNav label={t("navigation.label")} activeKey={tab}>
            {Object.keys(navigation).map((name) => (
              <button
                key={name}
                type="button"
                aria-current={tab === name ? "page" : undefined}
                onClick={() => {
                  setTab(name);
                  setView(navigation[name][0]);
                }}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors sm:px-4 ${tab === name ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
              >
                {navLabels[name] ?? name}
              </button>
            ))}
          </AdminScrollNav>
          {navigation[tab].length > 1 && (
            <AdminScrollNav
              label={t("shell.viewNavigation", { tab: navLabels[tab] ?? tab })}
              activeKey={view}
            >
              {navigation[tab].map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-current={view === name ? "page" : undefined}
                  onClick={() => setView(name)}
                  className={`shrink-0 border-b-2 px-3 py-2 font-medium ${view === name ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
                >
                  {viewLabel?.(name) ?? navLabels[name] ?? name}
                </button>
              ))}
            </AdminScrollNav>
          )}
          {children(tab, view, viewLabel?.(view) ?? navLabels[view] ?? view)}
        </main>
      </div>
    </PreviewNavigationContext>
  );
}
