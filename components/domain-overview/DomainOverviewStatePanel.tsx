"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { AccentCtaLink } from "@/components/ui/AccentCtaLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import { formatDateTime } from "@/lib/dates/format";
import type { ResearchScope } from "@/lib/research/scope";
import { appPath } from "@/lib/routing/app-path";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { ChartLineDownIcon as ChartLineDown } from "@phosphor-icons/react/dist/csr/ChartLineDown";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/csr/Globe";
import { MagnifyingGlassMinusIcon as MagnifyingGlassMinus } from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useDomainOverviewCacheDuration } from "./DomainOverviewCacheProvider";
import { DomainOverviewResultsLoading } from "./DomainOverviewLoadingSkeletons";
import type { DomainOverviewUiState } from "./domain-overview-workspace-model";

type DomainOverviewStatePanelProps = {
  charged?: boolean | null;
  onClearFilters?: () => void;
  onRetry?: () => void;
  projectRef: string;
  resetAt?: number;
  retryLabel?: string;
  researchScope?: ResearchScope | null;
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
          icon={<MagnifyingGlassMinus weight="regular" size={24} />}
          title={title}
        />
      </div>
    </Card>
  );
}

function ProviderAction({ projectRef }: Readonly<{ projectRef: string }>) {
  const t = useTranslations("projectDomainOverview.workspace.state");
  return <AccentCtaLink href={appPath(projectRef, "integrations")}>{t("connect")}</AccentCtaLink>;
}

export function DomainOverviewStatePanel({
  charged = null,
  onClearFilters,
  onRetry,
  projectRef,
  resetAt,
  retryLabel = "Retry",
  researchScope,
  state,
  target,
}: Readonly<DomainOverviewStatePanelProps>) {
  const dateFormat = useDateFormat();
  const cacheDuration = useDomainOverviewCacheDuration();
  const t = useTranslations("projectDomainOverview.workspace.state");
  const uiT = useTranslations("projectDomainOverview.workspace.ui");
  if (state === "loading") return <DomainOverviewResultsLoading ariaLabel={uiT("loading")} />;
  if (state === "idle") {
    return (
      <EmptyState
        bullets={[
          t("idleBullets.key"),
          t("idleBullets.cache", { duration: cacheDuration }),
          t("idleBullets.track"),
        ]}
        mark={<ModuleMark bordered icon={Globe} />}
        title={t("idleTitle")}
      />
    );
  }
  if (state === "no_provider") {
    return (
      <EmptyState
        action={<ProviderAction projectRef={projectRef} />}
        description={t("noProviderDescription")}
        mark={<ModuleMark bordered icon={Globe} />}
        title={t("noProviderTitle")}
      />
    );
  }
  if (state === "needs_reauth") {
    return (
      <EmptyState
        action={
          <AccentCtaLink href={appPath(projectRef, "integrations")}>{t("reconnect")}</AccentCtaLink>
        }
        description={t("reauthDescription")}
        mark={<ModuleMark bordered icon={Globe} />}
        title={t("reauthTitle")}
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
            {t("raiseBudget")}
          </Link>
        }
        description={t("budgetDescription")}
        icon={<ChartLineDown weight="regular" size={28} />}
        title={t("budgetTitle")}
      />
    );
  }
  if (state === "unsupported_location") {
    const description = researchScope
      ? t("unsupportedWithScope", {
          country: researchScope.countryName,
          language: researchScope.languageLabel,
        })
      : t("unsupported");
    return (
      <EmptyState
        description={description}
        icon={<Globe weight="regular" size={28} />}
        title={t("unsupportedTitle")}
      />
    );
  }
  if (state === "in_progress") {
    return (
      <EmptyState
        description={
          resetAt
            ? t("inProgressAfter", { time: formatDateTime(new Date(resetAt), dateFormat) })
            : t("inProgress")
        }
        icon={<ArrowsClockwise weight="regular" size={28} />}
        title={t("inProgressTitle")}
      />
    );
  }
  if (state === "rate_limited") {
    return (
      <EmptyState
        description={
          resetAt
            ? t("rateLimitedAfter", { time: formatDateTime(new Date(resetAt), dateFormat) })
            : t("rateLimited")
        }
        icon={<ArrowsClockwise weight="regular" size={28} />}
        title={t("rateLimitedTitle")}
      />
    );
  }
  if (state === "cost_limit_exceeded") {
    return (
      <EmptyState
        description={t("costDescription")}
        icon={<ChartLineDown weight="regular" size={28} />}
        title={t("costTitle")}
      />
    );
  }
  if (state === "snapshot_expired") {
    return (
      <EmptyState
        description={t("expiredDescription")}
        icon={<ArrowsClockwise weight="regular" size={28} />}
        title={t("expiredTitle")}
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
            {t("backlinks")}
          </Button>
        }
        description={t("noDataDescription", {
          scope: researchScope
            ? `${researchScope.countryName} / ${researchScope.languageLabel}`
            : "none",
          target: target ?? "this domain",
        })}
        sectionTitle={t("noDataSection")}
        title={t("noDataTitle")}
      />
    );
  }
  if (state === "empty") {
    return (
      <EmptyState
        action={
          onClearFilters ? (
            <Button onClick={onClearFilters} variant="secondary">
              {t("clearFilters")}
            </Button>
          ) : null
        }
        compact
        icon={<MagnifyingGlassMinus weight="regular" size={28} />}
        title={t("emptyTitle")}
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
        description={t("partialDescription")}
        icon={<ArrowsClockwise weight="regular" size={24} />}
        title={t("partialTitle")}
      />
    );
  }
  return (
    <EmptyState
      action={
        onRetry ? (
          <Button onClick={onRetry} startIcon={<ArrowsClockwise weight="regular" size={15} />}>
            {retryLabel}
          </Button>
        ) : null
      }
      description={
        <span className="grid justify-items-center gap-1.5">
          <span>{t("lookupDescription")}</span>
          {charged === false ? (
            <span className="inline-flex items-center gap-1 font-semibold text-green-text">
              <CheckCircle size={14} weight="regular" /> {t("notCharged")}
            </span>
          ) : null}
          {charged === true ? <span>{t("charged")}</span> : null}
        </span>
      }
      icon={<ArrowsClockwise weight="regular" size={28} />}
      title={t("lookupTitle")}
    />
  );
}
