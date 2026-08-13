"use client";

import { Button, Card, EmptyState } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  ChartLineDownIcon as ChartLineDown,
  CheckCircleIcon as CheckCircle,
  GlobeIcon as Globe,
  MagnifyingGlassMinusIcon as MagnifyingGlassMinus,
  PlugsConnectedIcon as PlugsConnected,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DomainOverviewResultsLoading } from "./DomainOverviewLoadingSkeletons";
import type { DomainOverviewUiState } from "./domain-overview-workspace-model";

type DomainOverviewStatePanelProps = {
  charged?: boolean | null;
  market?: string;
  onClearFilters?: () => void;
  onRetry?: () => void;
  projectRef: string;
  resetAt?: number;
  retryLabel?: string;
  state: DomainOverviewUiState;
  target?: string;
};

export function DomainOverviewNoDataCard({
  action,
  description,
  sectionTitle,
  title,
}: Readonly<{
  action?: ReactNode;
  description: ReactNode;
  sectionTitle: string;
  title: string;
}>) {
  return (
    <Card className="flex min-h-[260px] min-w-0 flex-col px-4 py-4" size="md">
      <h3 className="m-0 text-[14.5px] font-semibold">{sectionTitle}</h3>
      <div className="grid flex-1 place-items-center">
        <EmptyState
          action={action}
          compact
          description={description}
          icon={<MagnifyingGlassMinus size={24} />}
          title={title}
        />
      </div>
    </Card>
  );
}

function ProviderAction({ projectRef }: Readonly<{ projectRef: string }>) {
  return (
    <Button
      component={Link}
      href={appPath(projectRef, "integrations")}
      startIcon={<PlugsConnected size={15} />}
    >
      Connect DataForSEO
    </Button>
  );
}

export function DomainOverviewStatePanel({
  charged = null,
  market,
  onClearFilters,
  onRetry,
  projectRef,
  resetAt,
  retryLabel = "Retry",
  state,
  target,
}: Readonly<DomainOverviewStatePanelProps>) {
  if (state === "loading") return <DomainOverviewResultsLoading />;
  if (state === "idle") {
    return (
      <EmptyState
        bullets={[
          "Runs on your own DataForSEO key",
          "Results cached for 12 hours, repeat lookups are free",
          "Turn findings into tracked keywords in one click",
        ]}
        icon={<Globe size={28} />}
        title="Analyze any domain"
      />
    );
  }
  if (state === "no_provider") {
    return (
      <EmptyState
        action={<ProviderAction projectRef={projectRef} />}
        description="Domain Overview requires a provider with domain intelligence support. Lookups run on your own key."
        icon={<PlugsConnected size={28} />}
        title="Connect DataForSEO to analyze domains"
      />
    );
  }
  if (state === "needs_reauth") {
    return (
      <EmptyState
        action={
          <Button component={Link} href={appPath(projectRef, "integrations")}>
            Reconnect DataForSEO
          </Button>
        }
        description="Reconnect this project's DataForSEO credentials to resume domain analysis."
        icon={<PlugsConnected size={28} />}
        title="DataForSEO needs to be reconnected"
      />
    );
  }
  if (state === "budget_exhausted") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-accent-text hover:underline"
            href={appPath(projectRef, "settings#provider-usage")}
          >
            Raise the budget
          </Link>
        }
        description="Fresh lookups resume after the monthly reset. Cached recent analyses remain free."
        icon={<ChartLineDown size={28} />}
        title="Monthly provider budget reached"
      />
    );
  }
  if (state === "unsupported_location") {
    return (
      <EmptyState
        description="Domain intelligence is not available for this market. Choose another country or city."
        icon={<Globe size={28} />}
        title="This market is not supported for Domain Overview"
      />
    );
  }
  if (state === "in_progress") {
    return (
      <EmptyState
        description={
          resetAt
            ? `Another analysis is already running. Try again after ${new Date(resetAt).toLocaleTimeString()}.`
            : "Another analysis is already running. Wait for it to finish before retrying."
        }
        icon={<ArrowsClockwise size={28} />}
        title="Analysis already in progress"
      />
    );
  }
  if (state === "rate_limited") {
    return (
      <EmptyState
        description={
          resetAt
            ? `The provider is temporarily rate limited. Try again after ${new Date(resetAt).toLocaleTimeString()}.`
            : "The provider is temporarily rate limited. Try again shortly."
        }
        icon={<ArrowsClockwise size={28} />}
        title="Provider rate limit reached"
      />
    );
  }
  if (state === "cost_limit_exceeded") {
    return (
      <EmptyState
        description="The price changed before the lookup started. Review the updated estimate above before analyzing again."
        icon={<ChartLineDown size={28} />}
        title="The approved price is no longer current"
      />
    );
  }
  if (state === "snapshot_expired") {
    return (
      <EmptyState
        description="The cached analysis expired. Review the current price above before running it again."
        icon={<ArrowsClockwise size={28} />}
        title="This cached analysis has expired"
      />
    );
  }
  if (state === "no_data") {
    return (
      <DomainOverviewNoDataCard
        action={
          <Button
            component={Link}
            href={`${appPath(projectRef, "backlinks")}${target ? `?target=${encodeURIComponent(target)}` : ""}`}
            variant="secondary"
          >
            Check backlinks instead
          </Button>
        }
        description={`The DataForSEO index may not cover ${target ?? "this domain"} yet${market ? ` in ${market}` : ""}. Try another market or scope.`}
        sectionTitle="Index coverage"
        title="No index data for this domain"
      />
    );
  }
  if (state === "empty") {
    return (
      <EmptyState
        action={
          onClearFilters ? (
            <Button onClick={onClearFilters} variant="secondary">
              Clear filters
            </Button>
          ) : null
        }
        compact
        icon={<MagnifyingGlassMinus size={28} />}
        title="Nothing matches these filters"
      />
    );
  }
  if (state === "partial") {
    return (
      <EmptyState
        action={
          onRetry ? (
            <Button onClick={onRetry} size="sm" variant="secondary">
              {retryLabel}
            </Button>
          ) : null
        }
        compact
        description="This section could not be loaded. The rest of the analysis is still available."
        icon={<ArrowsClockwise size={24} />}
        title="Part of this report is unavailable"
      />
    );
  }
  return (
    <EmptyState
      action={
        onRetry ? (
          <Button onClick={onRetry} startIcon={<ArrowsClockwise size={15} />}>
            {retryLabel}
          </Button>
        ) : null
      }
      description={
        <span className="grid justify-items-center gap-1.5">
          <span>The request failed before a complete report came back.</span>
          {charged === false ? (
            <span className="inline-flex items-center gap-1 font-semibold text-green-text">
              <CheckCircle size={14} weight="fill" /> You were not charged for the failed attempt.
            </span>
          ) : null}
          {charged === true ? <span>The provider reported a charge for this attempt.</span> : null}
        </span>
      }
      icon={<ArrowsClockwise size={28} />}
      title="That lookup did not go through"
    />
  );
}
