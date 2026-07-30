"use client";

import { Button, EmptyState } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import { docsLinkProps } from "@/lib/site/site";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  BinocularsIcon as Binoculars,
  CheckCircleIcon as CheckCircle,
  MagnifyingGlassMinusIcon as MagnifyingGlassMinus,
  PlugsConnectedIcon as PlugsConnected,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ResearchResultsLoading } from "./ResearchLoadingSkeletons";

export type ResearchState =
  | "budget_exhausted"
  | "empty"
  | "idle"
  | "loading"
  | "lookup_failed"
  | "needs_reauth"
  | "no_provider"
  | "unsupported_location";

type ResearchStatePanelProps = {
  cached?: boolean | null;
  charged?: boolean | null;
  market?: string;
  mode?: string;
  onEditSearch?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  resumeLabel?: string;
  projectRef: string;
  state: ResearchState;
};

function IdleState() {
  return (
    <EmptyState
      bullets={[
        "Runs on your own DataForSEO key",
        "Results cached for 12 hours, repeat lookups are free",
        "Grouped variants and already-tracked phrases marked",
      ]}
      icon={<Binoculars size={28} />}
      title="Research starts with a seed"
    />
  );
}

function LoadingState() {
  return <ResearchResultsLoading />;
}

function NoProviderState({ projectRef }: Readonly<{ projectRef: string }>) {
  return (
    <EmptyState
      action={
        <div className="grid justify-items-center gap-3">
          <Button
            component={Link}
            href={appPath(projectRef, "integrations")}
            startIcon={<PlugsConnected size={15} />}
          >
            Connect DataForSEO
          </Button>
          <span className="text-fg-faint">
            SerpApi does not offer research endpoints, so it cannot power this page.
          </span>
        </div>
      }
      description="Lookups run on your own key and are billed by DataForSEO to your own account. Connect it in this project's integrations."
      icon={<PlugsConnected size={28} />}
      title="Keyword research needs a connected DataForSEO account"
    />
  );
}

function LookupFailedState({
  charged,
  onRetry,
  projectRef,
  retryLabel,
}: Readonly<{
  charged: boolean | null;
  onRetry?: () => void;
  projectRef: string;
  retryLabel: string;
}>) {
  return (
    <EmptyState
      action={
        <div className="grid justify-items-center gap-3">
          {onRetry ? (
            <Button onClick={onRetry} startIcon={<ArrowsClockwise size={15} />}>
              {retryLabel}
            </Button>
          ) : null}
          <span className="text-fg-faint">
            If this keeps happening, check the provider status in{" "}
            <Link
              className="font-semibold text-accent hover:underline"
              href={appPath(projectRef, "integrations")}
            >
              Integrations
            </Link>
            .
          </span>
        </div>
      }
      description={
        <span className="grid justify-items-center gap-1.5">
          <span>The request failed before any results came back.</span>
          {charged === false ? (
            <span className="inline-flex items-center gap-1 font-semibold text-green">
              <CheckCircle size={14} weight="fill" />
              {"You weren't charged for the failed attempt."}
            </span>
          ) : null}
          {charged === true ? (
            <span>
              The provider reported a charge before it failed - check your DataForSEO dashboard.
            </span>
          ) : null}
        </span>
      }
      icon={<ArrowsClockwise size={28} />}
      title="That lookup did not go through"
    />
  );
}

function EmptyResultsState({
  cached,
  market,
  mode,
  onEditSearch,
}: Readonly<{
  cached: boolean | null;
  market?: string;
  mode: string;
  onEditSearch?: () => void;
}>) {
  const bullets = [
    ...(mode === "auto" ? [] : ["Switch mode to Auto to cascade across all sources"]),
    "Broaden a seed: shorter, more generic phrasing",
    "Try a larger market, some phrases only surface there",
  ];

  return (
    <EmptyState
      action={
        <div className="grid justify-items-center gap-3">
          {onEditSearch ? (
            <Button onClick={onEditSearch} variant="secondary">
              Edit search
            </Button>
          ) : null}
          {cached == null ? null : (
            <span className="text-fg-faint">
              {cached
                ? "Served from the 12-hour cache, this repeat was free."
                : "This lookup was charged once. Repeats within 12 hours are free."}
            </span>
          )}
        </div>
      }
      bullets={bullets}
      icon={<MagnifyingGlassMinus size={28} />}
      title={market ? `No ideas found for these seeds in ${market}` : "No keyword ideas found"}
    />
  );
}

function MessageState({
  action,
  description,
  title,
}: Readonly<{ action?: ReactNode; description: ReactNode; title: string }>) {
  return (
    <EmptyState
      action={action}
      description={description}
      icon={<CheckCircle size={28} />}
      title={title}
    />
  );
}

export function ResearchStatePanel({
  cached = null,
  charged = null,
  market,
  mode = "auto",
  onEditSearch,
  onRetry,
  retryLabel = "Retry",
  resumeLabel = "next month",
  projectRef,
  state,
}: Readonly<ResearchStatePanelProps>) {
  if (state === "idle") return <IdleState />;
  if (state === "loading") return <LoadingState />;
  if (state === "no_provider") return <NoProviderState projectRef={projectRef} />;
  if (state === "budget_exhausted") {
    return (
      <MessageState
        action={
          <Link
            className="font-semibold text-accent hover:underline"
            href={appPath(projectRef, "settings#provider-usage")}
          >
            Raise the budget
          </Link>
        }
        description={
          <>
            Fresh provider lookups resume {resumeLabel}. Cached recent searches remain free and
            available.{" "}
            <Link
              className="font-semibold text-accent hover:underline"
              href="/docs/integrations#budget-cap"
              {...docsLinkProps("/docs/integrations#budget-cap")}
            >
              How budgets work
            </Link>
          </>
        }
        title="Monthly provider budget reached"
      />
    );
  }
  if (state === "needs_reauth") {
    return (
      <MessageState
        action={
          <Button component={Link} href={appPath(projectRef, "integrations")}>
            Reconnect DataForSEO
          </Button>
        }
        description="Reconnect the project's DataForSEO credentials to resume research lookups."
        title="DataForSEO needs to be reconnected"
      />
    );
  }
  if (state === "unsupported_location") {
    return (
      <MessageState
        description="Keyword research is not available for this market. Rank tracking for it is unaffected."
        title="This market is not supported for research"
      />
    );
  }
  if (state === "lookup_failed") {
    return (
      <LookupFailedState
        charged={charged}
        onRetry={onRetry}
        projectRef={projectRef}
        retryLabel={retryLabel}
      />
    );
  }
  return (
    <EmptyResultsState cached={cached} market={market} mode={mode} onEditSearch={onEditSearch} />
  );
}
