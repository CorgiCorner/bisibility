"use client";

import type {
  CheckRange,
  CheckRunFilter,
  CheckRunsView,
  ProviderHealthEntry,
} from "@/lib/checks/contract";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type CheckRunsTranslations, rangeCaption, rangeWindow } from "./check-runs-format";

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
  const t = useTranslations("projectRankTracker.checks");
  const skipped = view.deferredGroups.find((group) => group.reason === "rate_limited")?.count ?? 0;
  const provider = rateLimitedProvider(view.providerHealth);
  if (skipped === 0) return null;
  const completedViaFallback = provider
    ? Math.max(0, provider.rateLimited - skipped)
    : view.counts.viaFallback;
  const affected = skipped + completedViaFallback;

  return (
    <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-card border border-yellow/35 bg-yellow/10 px-3.5 py-3 text-[12.5px] text-fg">
      <WarningCircle
        aria-hidden
        className="mt-0.5 shrink-0 text-yellow-text"
        size={17}
        weight="regular"
      />
      <p className="m-0 min-w-0 flex-1 leading-relaxed">
        <strong>
          {t("providerRateLimiting", { provider: provider?.providerLabel ?? t("aProvider") })}
        </strong>{" "}
        {t("rateLimitSummary", {
          affected,
          fallback: completedViaFallback,
          skipped,
          window: rangeWindow(range, t),
        })}
      </p>
      <button
        className="shrink-0 font-semibold text-accent-text outline-none hover:text-accent-text focus-visible:underline"
        onClick={() => onFilterChange("deferred")}
        type="button"
      >
        {t("showDeferred")}
      </button>
    </div>
  );
}

function ProviderRow({
  provider,
  t,
}: Readonly<{ provider: ProviderHealthEntry; t: CheckRunsTranslations }>) {
  const parts = [t("asPrimary", { count: provider.direct })];
  if (provider.coveredAsFallback > 0) {
    parts.push(t("asBackup", { count: provider.coveredAsFallback }));
  }
  parts.push(t("rateLimitedCount", { count: provider.rateLimited }));
  return (
    <div className="grid min-w-0 grid-cols-[minmax(90px,132px)_minmax(90px,1fr)] items-baseline gap-3 py-1">
      <span className="truncate text-[12.5px] font-semibold text-fg">{provider.providerLabel}</span>
      <p className="m-0 min-w-0 font-sans tabular-nums text-[10.5px] text-fg-muted">
        {parts.join(" · ")}
      </p>
    </div>
  );
}

function joinedClauses(clauses: string[], t: CheckRunsTranslations) {
  if (clauses.length < 2) return clauses[0] ?? "";
  const last = clauses.at(-1);
  if (!last) return "";
  return t("joinedClauses", {
    first: clauses.slice(0, -1).join(", "),
    last,
  });
}

function deliveryVerdict(view: CheckRunsView, primaryLabel: string, t: CheckRunsTranslations) {
  const total = view.counts.completed + view.counts.failed + view.counts.deferred;
  const clauses: string[] = [];
  if (view.counts.viaFallback > 0) {
    clauses.push(t("backupCovered", { count: view.counts.viaFallback }));
  }
  if (view.counts.failed > 0) clauses.push(t("failedCount", { count: view.counts.failed }));
  if (view.counts.deferred > 0) {
    clauses.push(t("skippedCount", { count: view.counts.deferred }));
  }
  if (clauses.length === 0) {
    return t("deliveryWithoutIssues", {
      delivered: view.counts.completed,
      primary: primaryLabel,
      total,
    });
  }
  return t("deliveryWithIssues", {
    delivered: view.counts.completed,
    issues: joinedClauses(clauses, t),
    total,
  });
}

function routeFlow(view: CheckRunsView, t: CheckRunsTranslations) {
  const rateLimited = view.providerHealth.reduce((sum, provider) => sum + provider.rateLimited, 0);
  const skipped = view.deferredGroups.find((group) => group.reason === "rate_limited")?.count ?? 0;
  if (rateLimited > 0) {
    const unresolved = Math.max(0, rateLimited - view.counts.viaFallback - skipped);
    const outcomes = [
      t("rateLimitedCount", { count: rateLimited }),
      view.counts.viaFallback > 0
        ? t("checksCoveredByBackup", { count: view.counts.viaFallback })
        : null,
      skipped > 0 ? t("skippedSummary", { count: skipped }) : null,
      unresolved > 0 ? t("unresolvedCount", { count: unresolved }) : null,
    ].filter((outcome): outcome is string => Boolean(outcome));
    return t("routeOutcomes", { outcomes: outcomes.join(" · ") });
  }
  return view.counts.failed > 0
    ? t("providerChainExhausted", { count: view.counts.failed })
    : t("noProviderRoutingIssues");
}

export function ProviderHealth({
  onFilterChange,
  range,
  reorderProvidersHref,
  view,
}: Readonly<HealthProps>) {
  const t = useTranslations("projectRankTracker.checks");
  const primary = view.providerHealth.find((provider) => provider.isPrimary);
  if (!primary && view.providerHealth.length === 0) return null;
  const primaryLabel =
    primary?.providerLabel ?? view.providerHealth[0]?.providerLabel ?? t("primary");
  const skipped = view.counts.deferred > 0;

  return (
    <section
      aria-label={t("checkDeliveryAria", { range: rangeCaption(range, t) })}
      className="mx-4 mt-3 rounded-card border border-border bg-bg-sunken px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-sans tabular-nums text-[10.5px] font-semibold uppercase tracking-[.05em] text-fg-muted">
          {t("checkDelivery", { range: rangeCaption(range, t) })}
        </h3>
        <HealthLink href={reorderProvidersHref} />
      </div>
      <p className="mb-0 mt-2.5 text-[12.5px] leading-[1.55] text-fg">
        {deliveryVerdict(view, primaryLabel, t)}
      </p>
      <div className="mt-2.5 border-border border-t pt-2.5">
        <p className="m-0 font-sans tabular-nums text-[10.5px] leading-relaxed text-fg-muted">
          {routeFlow(view, t)}
        </p>
        {skipped ? (
          <button
            className="mt-1.5 p-0 text-[11px] font-semibold text-accent-text hover:underline focus-visible:underline"
            onClick={() => onFilterChange("deferred")}
            type="button"
          >
            {t("showSkipped")}
          </button>
        ) : null}
        <details className="mt-2">
          <summary className="cursor-pointer font-sans tabular-nums text-[10px] uppercase tracking-[0.3px] text-fg-muted hover:text-fg">
            {t("perProvider")}
          </summary>
          <div className="mt-2 space-y-1">
            {view.providerHealth.map((provider) => (
              <ProviderRow key={provider.provider} provider={provider} t={t} />
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

function HealthLink({ href }: Readonly<{ href: string }>) {
  const t = useTranslations("projectRankTracker.checks");
  return (
    <Link
      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-text outline-none hover:text-accent-text focus-visible:underline"
      href={href}
    >
      {t("providerChain")}
      <CaretRight aria-hidden size={12} weight="regular" />
    </Link>
  );
}
