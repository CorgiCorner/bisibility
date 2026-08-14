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
  onFilterChange: (filter: CheckRunFilter) => void;
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

function ProviderRow({ provider }: Readonly<{ provider: ProviderHealthEntry }>) {
  const parts = [`${provider.direct.toLocaleString("en-US")} as primary`];
  if (provider.coveredAsFallback > 0) {
    parts.push(`${provider.coveredAsFallback.toLocaleString("en-US")} as backup`);
  }
  parts.push(`${provider.rateLimited.toLocaleString("en-US")} rate-limited`);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(90px,132px)_minmax(90px,1fr)] items-baseline gap-3 py-1">
      <span className="truncate text-[12.5px] font-semibold text-fg">{provider.providerLabel}</span>
      <p className="m-0 min-w-0 font-mono text-[10.5px] text-fg-muted">{parts.join(" · ")}</p>
    </div>
  );
}

function joinedClauses(clauses: string[]) {
  if (clauses.length < 2) return clauses[0] ?? "";
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`;
}

function deliveryVerdict(view: CheckRunsView, primaryLabel: string) {
  const total = view.counts.completed + view.counts.failed + view.counts.deferred;
  const delivered = view.counts.completed.toLocaleString("en-US");
  const clauses: string[] = [];
  if (view.counts.viaFallback > 0) {
    clauses.push(`backup covered ${view.counts.viaFallback.toLocaleString("en-US")} checks`);
  }
  if (view.counts.failed > 0) clauses.push(`${view.counts.failed.toLocaleString("en-US")} failed`);
  if (view.counts.deferred > 0) {
    clauses.push(`${view.counts.deferred.toLocaleString("en-US")} were skipped`);
  }
  if (clauses.length === 0) {
    return `${delivered} of ${total.toLocaleString("en-US")} checks delivered through ${primaryLabel} with no fallback, failures, or skips.`;
  }
  return `${delivered} of ${total.toLocaleString("en-US")} checks delivered - ${joinedClauses(clauses)}.`;
}

function routeFlow(view: CheckRunsView) {
  const rateLimited = view.providerHealth.reduce((sum, provider) => sum + provider.rateLimited, 0);
  const skipped = view.deferredGroups.find((group) => group.reason === "rate_limited")?.count ?? 0;
  if (rateLimited > 0) {
    const unresolved = Math.max(0, rateLimited - view.counts.viaFallback - skipped);
    const outcomes = [
      `${rateLimited.toLocaleString("en-US")} rate-limited`,
      view.counts.viaFallback > 0
        ? `${view.counts.viaFallback.toLocaleString("en-US")} checks covered by backup`
        : null,
      skipped > 0 ? `${skipped.toLocaleString("en-US")} skipped` : null,
      unresolved > 0 ? `${unresolved.toLocaleString("en-US")} unresolved` : null,
    ].filter((outcome): outcome is string => Boolean(outcome));
    return `${outcomes.join(" · ")}.`;
  }
  return view.counts.failed > 0
    ? `${view.counts.failed.toLocaleString("en-US")} failed after the provider chain was exhausted.`
    : "No provider routing issues in this window.";
}

export function ProviderHealth({
  onFilterChange,
  range,
  reorderProvidersHref,
  view,
}: Readonly<HealthProps>) {
  const primary = view.providerHealth.find((provider) => provider.isPrimary);
  if (!primary && view.providerHealth.length === 0) return null;
  const primaryLabel = primary?.providerLabel ?? view.providerHealth[0]?.providerLabel ?? "Primary";
  const skipped = view.counts.deferred > 0;

  return (
    <section
      aria-label={`Check delivery, ${rangeCopy[range].caption}`}
      className="mx-4 mt-3 rounded-xl border border-border bg-bg-sunken px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-mono text-[10.5px] font-semibold uppercase tracking-[.05em] text-fg-muted">
          Check delivery · {rangeCopy[range].caption}
        </h3>
        <HealthLink href={reorderProvidersHref} />
      </div>
      <p className="mb-0 mt-2.5 text-[12.5px] leading-[1.55] text-fg">
        {deliveryVerdict(view, primaryLabel)}
      </p>
      <div className="mt-2.5 border-border-soft border-t pt-2.5">
        <p className="m-0 font-mono text-[10.5px] leading-relaxed text-fg-muted">
          {routeFlow(view)}
        </p>
        {skipped ? (
          <button
            className="mt-1.5 p-0 text-[11px] font-semibold text-accent-text hover:underline focus-visible:underline"
            onClick={() => onFilterChange("deferred")}
            type="button"
          >
            Show skipped
          </button>
        ) : null}
        <details className="mt-2">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.3px] text-fg-muted hover:text-fg">
            Per provider
          </summary>
          <div className="mt-2 space-y-1">
            {view.providerHealth.map((provider) => (
              <ProviderRow key={provider.provider} provider={provider} />
            ))}
          </div>
        </details>
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
      Provider chain
      <CaretRight aria-hidden size={12} weight="bold" />
    </Link>
  );
}
