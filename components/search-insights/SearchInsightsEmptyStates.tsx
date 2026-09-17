"use client";

import { useDateDisplay, useDateFormat } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import {
  resolveSearchBackfillPresentation,
  type SearchBackfillFacts,
  type SearchBackfillKind,
} from "@/lib/search-insights/sync/control-model";
import { VIEWER_ASK_ADMIN_GSC } from "@/lib/ui/viewer-affordances";
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { GoogleLogoIcon as GoogleLogo } from "@phosphor-icons/react/dist/csr/GoogleLogo";
import { useTranslations } from "next-intl";
import { SearchInsightsRefresh } from "./SearchInsightsRefresh";
import { formatSearchSyncCalendarDay, presentSearchSync } from "./search-sync-presentation";

export type SearchInsightsNoPropertyStateProps = {
  canManageProviders?: boolean;
  projectId: string;
  propertyName?: string;
  /** The connection exists but the provider stopped accepting the stored authorization. */
  reauth?: boolean;
};

export function searchInsightsModulePath(projectId: string) {
  return searchConsolePath(asProjectRef(projectId));
}

export function SearchInsightsNoPropertyState({
  canManageProviders = true,
  projectId,
  propertyName,
  reauth = false,
}: Readonly<SearchInsightsNoPropertyStateProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const href = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: searchInsightsModulePath(projectId),
  });
  return (
    <EmptyState
      action={
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button
            endIcon={<ArrowUpRight aria-hidden size={16} weight="regular" />}
            href="https://search.google.com/search-console/about"
            rel="noreferrer noopener"
            target="_blank"
            variant="secondary"
          >
            {t("openSearchConsole")}
          </Button>
          {canManageProviders ? (
            <Button href={href} variant="primary">
              {reauth ? t("reauthCta") : t("noPropertyCta")}
            </Button>
          ) : (
            <p className="m-0 self-center text-[13px] text-fg-muted">{VIEWER_ASK_ADMIN_GSC}</p>
          )}
        </div>
      }
      description={reauth ? t("reauthBody") : t("noPropertyBody")}
      mark={<ModuleMark bordered icon={GoogleLogo} label={t("searchConsoleModule")} />}
      title={
        reauth
          ? t("reauthTitle")
          : propertyName
            ? t("noFinalizedDaysForProperty", { property: propertyName })
            : t("noPropertyTitle")
      }
    />
  );
}

/**
 * The states this screen leaves on its own. They are also the only window where the module has no
 * strip to carry the refresh, so without one here the customer can only reload by hand. A state
 * that waits on the customer instead - reauth, paused by you - gets no control: nothing to watch.
 */
const SELF_RESOLVING: ReadonlySet<SearchBackfillKind> = new Set([
  "queued",
  "running",
  "status_unavailable",
  "waiting_worker",
]);

export type SearchInsightsNoDataStateProps = {
  canManageProviders?: boolean;
  facts: SearchBackfillFacts;
  projectId: string;
  pauseAction: SearchInsightsImportAction;
  resumeAction: SearchInsightsImportAction;
  retryAction: SearchInsightsImportAction;
};

export function SearchInsightsNoDataState({
  canManageProviders = true,
  facts,
  projectId,
}: Readonly<SearchInsightsNoDataStateProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const dateDisplay = useDateDisplay();
  const dateFormat = useDateFormat();
  const model = resolveSearchBackfillPresentation(facts, dateFormat);
  const localizedModel = presentSearchSync(model, t, (value) =>
    formatSearchSyncCalendarDay(value, dateDisplay),
  );
  const reconnectHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: searchInsightsModulePath(projectId),
  });
  const reconnectBlocked = model.action === "reconnect" && !canManageProviders;
  const primary =
    model.action === "reconnect" && canManageProviders ? (
      <Button href={reconnectHref} variant="primary">
        {t("reauthCta")}
      </Button>
    ) : null;
  const watching = SELF_RESOLVING.has(model.kind);
  const importRunning = model.kind === "running";
  const action =
    primary || watching || reconnectBlocked ? (
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {primary}
        {watching ? <SearchInsightsRefresh active={importRunning} /> : null}
        {reconnectBlocked ? (
          <p className="m-0 self-center text-[13px] text-fg-muted">{VIEWER_ASK_ADMIN_GSC}</p>
        ) : null}
      </div>
    ) : null;
  return (
    <EmptyState
      action={action}
      description={
        <>
          <p className="m-0">{t("firstViewBlocked")}</p>
          {localizedModel.supportingText ? (
            <p className="m-0 mt-1.5">{localizedModel.supportingText}</p>
          ) : null}
        </>
      }
      mark={<ModuleMark bordered icon={GoogleLogo} label={t("searchConsoleModule")} />}
      title={localizedModel.status}
    />
  );
}
