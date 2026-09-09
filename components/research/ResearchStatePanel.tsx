"use client";

import { AccentCtaLink } from "@/components/ui/AccentCtaLink";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import { appPath } from "@/lib/routing/app-path";
import { docsLinkProps } from "@/lib/site/site";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { BinocularsIcon as Binoculars } from "@phosphor-icons/react/dist/csr/Binoculars";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { MagnifyingGlassMinusIcon as MagnifyingGlassMinus } from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus";
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
  scopeLabel?: string;
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
      mark={<ModuleMark bordered icon={Binoculars} />}
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
        <AccentCtaLink href={appPath(projectRef, "integrations")}>Connect DataForSEO</AccentCtaLink>
      }
      description="Keyword Research requires a provider with keyword research support. Lookups run on your own key."
      mark={<ModuleMark bordered icon={Binoculars} />}
      title="Connect DataForSEO to research keywords"
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
            <Button onClick={onRetry} startIcon={<ArrowsClockwise weight="regular" size={15} />}>
              {retryLabel}
            </Button>
          ) : null}
          <span className="text-fg-muted">
            If this keeps happening, check the provider status in{" "}
            <Link
              className="font-semibold text-accent-text hover:underline"
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
            <span className="inline-flex items-center gap-1 font-semibold text-green-text">
              <CheckCircle size={14} weight="regular" />
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
      icon={<ArrowsClockwise weight="regular" size={28} />}
      title="That lookup did not go through"
    />
  );
}

function EmptyResultsState({
  cached,
  scopeLabel,
  mode,
  onEditSearch,
}: Readonly<{
  cached: boolean | null;
  scopeLabel?: string;
  mode: string;
  onEditSearch?: () => void;
}>) {
  const bullets = [
    ...(mode === "auto" ? [] : ["Switch mode to Auto to cascade across all sources"]),
    "Broaden a seed: shorter, more generic phrasing",
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
            <span className="text-fg-muted">
              {cached
                ? "Served from the 12-hour cache, this repeat was free."
                : "This lookup was charged once. Repeats within 12 hours are free."}
            </span>
          )}
        </div>
      }
      bullets={bullets}
      icon={<MagnifyingGlassMinus weight="regular" size={28} />}
      title={
        scopeLabel ? `No ideas found for these seeds in ${scopeLabel}` : "No keyword ideas found"
      }
    />
  );
}

function MessageState({
  action,
  description,
  mark,
  title,
}: Readonly<{ action?: ReactNode; description: ReactNode; mark?: ReactNode; title: string }>) {
  return (
    <EmptyState
      action={action}
      description={description}
      icon={mark ? undefined : <CheckCircle weight="regular" size={28} />}
      mark={mark}
      title={title}
    />
  );
}

export function ResearchStatePanel({
  cached = null,
  charged = null,
  scopeLabel,
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
            className="font-semibold text-accent-text hover:underline"
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
              className="font-semibold text-accent-text hover:underline"
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
          <AccentCtaLink href={appPath(projectRef, "integrations")}>
            Reconnect DataForSEO
          </AccentCtaLink>
        }
        description="Reconnect the project's DataForSEO credentials to resume research lookups."
        mark={<ModuleMark bordered icon={Binoculars} />}
        title="DataForSEO needs to be reconnected"
      />
    );
  }
  if (state === "unsupported_location") {
    return (
      <MessageState
        description={`Research is not available for ${scopeLabel ?? "this country and language"}. Rank tracking is unaffected.`}
        title="Research is not available for this country and language"
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
    <EmptyResultsState
      cached={cached}
      mode={mode}
      onEditSearch={onEditSearch}
      scopeLabel={scopeLabel}
    />
  );
}
