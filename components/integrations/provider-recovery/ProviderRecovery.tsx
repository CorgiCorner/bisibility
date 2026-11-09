"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import {
  checkProviderRecoveryAccount,
  loadProviderAffectedChecks,
} from "@/lib/actions/provider-recovery";
import type {
  AffectedCheckPage,
  ConnectionRecoveryView,
} from "@/lib/integrations/provider-recovery/types";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { AffectedChecksTable } from "./AffectedChecksTable";
import { ProviderAttentionNotice } from "./ProviderAttentionNotice";

export function ProviderRecovery({
  initial,
  projectId,
  connectionId,
  canManage,
  providerName,
  accountUrl,
}: {
  initial: ConnectionRecoveryView;
  projectId: string;
  connectionId: string;
  canManage: boolean;
  providerName: string;
  accountUrl?: string;
}) {
  const t = useTranslations("projectIntegrations.recovery");
  const locale = useLocale();
  const timeZone = useTimeZone();
  const formatMoment = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
      new Date(value),
    );
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [page, setPage] = useState<AffectedCheckPage | null>(null);
  const [open, setOpen] = useState(false);
  const state = checking || view.checking ? "checking" : view.state;
  const reason =
    view.reason ??
    (view.state === "billing"
      ? "provider_billing"
      : view.accountVerified
        ? "accounting_review"
        : "not_verified");
  const reasonKey =
    reason === "provider_billing"
      ? view.capacityUnit === "searches"
        ? "billingSearches"
        : "billing"
      : reason === "provider_auth"
        ? "credentials"
        : reason === "provider_account_restricted"
          ? "restricted"
          : reason === "accounting_review"
            ? "review"
            : "unverified";
  async function check() {
    if (!canManage || checking) return;
    setChecking(true);
    setError(false);
    try {
      const result = await checkProviderRecoveryAccount({ projectId, connectionId });
      if (result.view) setView(result.view);
      if (result.accountState === "unknown") setError(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }
  async function showChecks() {
    if (loadingChecks) return;
    setLoadingChecks(true);
    setError(false);
    try {
      setPage(
        await loadProviderAffectedChecks({
          projectId,
          connectionId,
          cursor: null,
          until: view.rangeEnd ?? new Date().toISOString(),
        }),
      );
      setOpen(true);
    } catch {
      setError(true);
    } finally {
      setLoadingChecks(false);
    }
  }
  return (
    <div className="my-4 flex min-w-0 flex-col gap-3">
      {dismissed === view.revision ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-bg-sunken p-3">
          <p className="m-0 text-[12px] text-fg-muted">
            {t(view.paused ? "dismissedPaused" : "dismissedReady")}
          </p>
          <Button onClick={() => setDismissed(null)} size="sm" variant="outline">
            {t("showDetails")}
          </Button>
        </div>
      ) : (
        <ProviderAttentionNotice
          accountUrl={accountUrl}
          allowCheck={view.canCheck !== false && reason !== "accounting_review" && view.paused}
          canManage={canManage}
          copy={{
            heading: t(
              state === "checking"
                ? "checkingHeading"
                : state === "ready"
                  ? "readyHeading"
                  : `${reasonKey}Heading`,
              { provider: providerName },
            ),
            description: t(
              state === "checking"
                ? "checkingDescription"
                : state === "ready"
                  ? "readyDescription"
                  : reasonKey === "restricted" &&
                      view.scope?.kind === "capability" &&
                      view.scope.capability === "rank_check"
                    ? "restrictedRankDescription"
                    : `${reasonKey}Description`,
            ),
          }}
          labels={{
            free: t("checkHint"),
            owner: t("owner"),
            dismiss: t("dismiss"),
            checking: t("checking"),
            check: t("check"),
            open: t("openProvider", { provider: providerName }),
            schedule: t("schedule"),
            checks: t(reason === "accounting_review" ? "reviewUsage" : "checks"),
          }}
          onCheck={() => void check()}
          onDismiss={() => setDismissed(view.revision)}
          onViewChecks={() =>
            view.state === "ready"
              ? router.push(projectSchedulesPath(projectId))
              : reason === "accounting_review"
                ? router.push(`${appPath(asProjectRef(projectId), "usage")}`)
                : void showChecks()
          }
          state={state}
        />
      )}
      <div className="flex flex-col gap-2 text-[12px] text-fg-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t(view.paused ? (view.anotherActive ? "pausedFallback" : "paused") : "readyStatus")}
          </span>
          {(view.checksNotSent ?? 0) > 0 ? (
            <Button
              disabled={loadingChecks}
              onClick={() => void showChecks()}
              size="sm"
              variant="outline"
            >
              {t("notSent", { count: view.checksNotSent ?? 0 })}
            </Button>
          ) : null}
        </div>
        {(view.checksNotSent ?? 0) > 0 && view.rangeEnd ? (
          <p className="m-0">{t("rangeThrough", { date: formatMoment(view.rangeEnd) })}</p>
        ) : null}
        {view.unconfirmedRequests > 0 ? (
          <p className="m-0">{t("accountingCount", { count: view.unconfirmedRequests })}</p>
        ) : null}
        {view.nextCheckAt ? (
          <p className="m-0">{t("nextCheck", { date: formatMoment(view.nextCheckAt) })}</p>
        ) : null}
        <p className="m-0">{t("savedSchedule")}</p>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[12px] text-red-text">
          {t("failed")}
        </p>
      ) : null}
      <AppDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("checks")}
        description={`${t("checksDescription")} ${view.rangeEnd ? t("rangeThrough", { date: formatMoment(view.rangeEnd) }) : ""}`}
        sheetOnMobile
      >
        {page ? (
          <AffectedChecksTable
            key={`${connectionId}:${page.rows[0]?.id ?? "empty"}`}
            initialPage={page}
            loadPage={(cursor) =>
              loadProviderAffectedChecks({
                projectId,
                connectionId,
                cursor,
                until: view.rangeEnd ?? new Date().toISOString(),
              })
            }
          />
        ) : null}
      </AppDrawer>
    </div>
  );
}
