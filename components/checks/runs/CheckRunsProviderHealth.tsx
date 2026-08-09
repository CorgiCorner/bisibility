"use client";

import type {
  CheckRange,
  CheckRunFilter,
  CheckRunsView,
  ProviderHealthEntry,
} from "@/lib/checks/contract";
import {
  CaretRightIcon as CaretRight,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { rangeCopy } from "./check-runs-format";

type HealthProps = {
  range: CheckRange;
  reorderProvidersHref: string;
  view: CheckRunsView;
};

function rateLimitedProvider(providerHealth: ProviderHealthEntry[]) {
  return providerHealth.reduce<ProviderHealthEntry | null>(
    (highest, provider) =>
      !highest || provider.rateLimited > highest.rateLimited ? provider : highest,
    null,
  );
}

type BannerProps = {
  onFilterChange: (filter: CheckRunFilter) => void;
  range: CheckRange;
  view: CheckRunsView;
};

export function RateLimitBanner({ onFilterChange, range, view }: Readonly<BannerProps>) {
  const skipped = view.deferredGroups.find((group) => group.reason === "rate_limited")?.count ?? 0;
  const provider = rateLimitedProvider(view.providerHealth);
  if (skipped === 0) return null;
  const completedViaFallback = provider
    ? Math.max(0, provider.rateLimited - skipped)
    : view.counts.viaFallback;
  const affected = skipped + completedViaFallback;

  return (
    <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-yellow/35 bg-yellow/10 px-3.5 py-3 text-[12.5px] text-fg">
      <WarningCircle
        aria-hidden
        className="mt-0.5 shrink-0 text-yellow-text"
        size={17}
        weight="fill"
      />
      <p className="m-0 min-w-0 flex-1 leading-relaxed">
        <strong>{provider?.providerLabel ?? "A provider"} is rate-limiting.</strong>{" "}
        {affected.toLocaleString("en-US")} checks hit rate limits {rangeCopy[range].window} -{" "}
        {completedViaFallback.toLocaleString("en-US")} fallback completions,{" "}
        {skipped.toLocaleString("en-US")} skipped; they retry on schedule.
      </p>
      <button
        className="shrink-0 font-semibold text-accent-text outline-none hover:text-accent-text focus-visible:underline"
        onClick={() => onFilterChange("deferred")}
        type="button"
      >
        Show deferred
      </button>
    </div>
  );
}

function ProviderRow({
  provider,
  runs,
}: Readonly<{ provider: ProviderHealthEntry; runs: number }>) {
  const directRate = runs > 0 ? Math.min(100, Math.round((provider.direct / runs) * 100)) : 0;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(90px,140px)_minmax(90px,1fr)] items-center gap-3 py-1.5">
      <span className="truncate text-[12.5px] font-semibold text-fg">{provider.providerLabel}</span>
      <div className="min-w-0">
        <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-bg-inset">
          <div
            aria-hidden
            className="h-full rounded-full bg-green"
            style={{ width: `${directRate}%` }}
          />
        </div>
        <p className="m-0 font-mono text-[10.5px] text-fg-muted">
          {directRate}% direct · {provider.rateLimited.toLocaleString("en-US")} rate-limited
        </p>
        {provider.coveredAsFallback > 0 ? (
          <p className="m-0 mt-0.5 font-mono text-[10.5px] text-yellow-text">
            covered {provider.coveredAsFallback.toLocaleString("en-US")} as fallback
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ProviderHealth({ range, reorderProvidersHref, view }: Readonly<HealthProps>) {
  const issueCount = view.providerHealth.reduce(
    (sum, provider) => sum + provider.rateLimited + provider.failed,
    0,
  );
  const skippedForRateLimits =
    view.deferredGroups.find((group) => group.reason === "rate_limited")?.count ?? 0;
  const primary = view.providerHealth.find((provider) => provider.isPrimary);
  if (issueCount === 0 && skippedForRateLimits === 0 && primary) {
    return (
      <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-bg-sunken px-3.5 py-2.5 text-[12.5px]">
        <span className="font-semibold text-green-text">
          Providers healthy · {primary.providerLabel} 100% direct
        </span>
        <HealthLink href={reorderProvidersHref} />
      </div>
    );
  }

  return (
    <section
      aria-label={`Provider health, ${rangeCopy[range].caption}`}
      className="mx-4 mt-3 rounded-xl border border-border bg-bg-sunken px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-mono text-[10.5px] font-semibold uppercase tracking-[.05em] text-fg-muted">
          Provider health · {rangeCopy[range].caption}
        </h3>
        <HealthLink href={reorderProvidersHref} />
      </div>
      <div className="mt-1 divide-y divide-border-soft">
        {view.providerHealth.map((provider) => (
          <ProviderRow key={provider.provider} provider={provider} runs={view.counts.runs} />
        ))}
      </div>
    </section>
  );
}

function HealthLink({ href }: Readonly<{ href: string }>) {
  return (
    <Link
      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-text outline-none hover:text-accent-text focus-visible:underline"
      href={href}
    >
      Reorder chain
      <CaretRight aria-hidden size={12} weight="bold" />
    </Link>
  );
}
