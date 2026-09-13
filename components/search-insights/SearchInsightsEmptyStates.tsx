"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
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
import { SearchInsightsRefresh } from "./SearchInsightsRefresh";
import {
  FIRST_VIEW_BLOCKED,
  NO_PROPERTY_BODY,
  NO_PROPERTY_CTA,
  NO_PROPERTY_TITLE,
  REAUTH_BODY,
  REAUTH_CTA,
  REAUTH_TITLE,
} from "./search-insights-copy";

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
            Open Search Console
          </Button>
          {canManageProviders ? (
            <Button href={href} variant="primary">
              {reauth ? REAUTH_CTA : NO_PROPERTY_CTA}
            </Button>
          ) : (
            <p className="m-0 self-center text-[13px] text-fg-muted">{VIEWER_ASK_ADMIN_GSC}</p>
          )}
        </div>
      }
      description={reauth ? REAUTH_BODY : NO_PROPERTY_BODY}
      mark={<ModuleMark bordered icon={GoogleLogo} label="Search Console module" />}
      title={
        reauth
          ? REAUTH_TITLE
          : propertyName
            ? `No finalized days yet for ${propertyName}`
            : NO_PROPERTY_TITLE
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
  const dateFormat = useDateFormat();
  const model = resolveSearchBackfillPresentation(facts, dateFormat);
  const reconnectHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: searchInsightsModulePath(projectId),
  });
  const reconnectBlocked = model.action === "reconnect" && !canManageProviders;
  const primary =
    model.action === "reconnect" && canManageProviders ? (
      <Button href={reconnectHref} variant="primary">
        Reconnect Search Console
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
          <p className="m-0">{FIRST_VIEW_BLOCKED}</p>
          {model.supportingText ? <p className="m-0 mt-1.5">{model.supportingText}</p> : null}
        </>
      }
      mark={<ModuleMark bordered icon={GoogleLogo} label="Search Console module" />}
      title={model.title}
    />
  );
}
