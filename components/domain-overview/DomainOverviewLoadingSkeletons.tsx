"use client";
import { ResearchIdleLoading } from "@/components/research/ResearchIdleLoading";
import { PageContent } from "@/components/shell/PageContent";
import { pricingTriggerClassName } from "@/components/ui/PricingPopover";
import { tableHeaderBorderClassName } from "@/components/ui/table-header-styles";
import { cn } from "@/lib/ui/cn";
import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";
import type { ComponentPropsWithoutRef } from "react";
import { useDomainOverviewCacheDuration } from "./DomainOverviewCacheProvider";

const six = ["traffic", "keywords", "top10", "value", "pos1", "new"] as const;
const eight = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;

function Bar({ className, ...props }: Readonly<ComponentPropsWithoutRef<"div">>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} {...props} />;
}

function ContextLoading() {
  return (
    <div className="flex flex-wrap gap-2.5 rounded-control border border-border bg-bg-elev p-3.5">
      <Bar className="h-7 w-[160px] rounded-full" />
      <Bar className="h-7 w-[190px] rounded-full" />
      <span className="basis-full" />
      <Bar className="h-3 w-[280px]" />
      <Bar className="ml-auto h-3 w-[112px]" />
    </div>
  );
}

function KpisLoading() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {six.map((key) => (
        <div className="rounded-card border border-border bg-bg-elev px-4.5 py-4" key={key}>
          <Bar className="h-2.5 w-[96px] bg-border" />
          <Bar className="mt-[9px] h-7 w-[120px]" />
        </div>
      ))}
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="rounded-card border border-border bg-bg-elev p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-4 w-[150px]" />
          <Bar className="ml-auto h-8 w-[86px]" />
          <Bar className="h-8 w-[86px]" />
        </div>
        <Bar className="mt-4 h-[260px] w-full" />
      </div>
      <div className="rounded-card border border-border bg-bg-elev p-4">
        <Bar className="h-4 w-[120px]" />
        <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-1">
          {["72", "64", "58", "50"].map((width) => (
            <Bar className="h-3" key={width} style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TableLoading({ pages = false }: Readonly<{ pages?: boolean }>) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-center gap-3 px-4 py-3">
        <Bar className="h-4 w-[150px]" />
        <Bar className="ml-auto h-8 w-[84px]" />
      </div>
      <div className="overflow-x-auto">
        <div className={pages ? "min-w-[900px]" : "min-w-[1180px]"}>
          <div
            className={cn(tableHeaderBorderClassName, "h-[42px] bg-bg-sunken")}
            data-table-header-border="header"
          />
          {eight.map((key, index) => (
            <div className="flex h-[58px] items-center gap-8 border-b border-border px-4" key={key}>
              <Bar className={cn("h-3", index % 2 ? "w-[58%]" : "w-[72%]")} />
              <Bar className="ml-auto h-3 w-[86px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DomainOverviewResultsLoading({ ariaLabel }: Readonly<{ ariaLabel: string }>) {
  return (
    <div aria-busy="true" aria-label={ariaLabel} className="grid min-w-0 gap-4.5">
      <ContextLoading />
      <KpisLoading />
      <ChartLoading />
      <div className="rounded-card border border-border bg-bg-elev p-4">
        <Bar className="h-4 w-[210px]" />
        <div className="mt-4 grid gap-3">
          {six.map((key, index) => (
            <Bar className="h-3" key={key} style={{ width: `${30 + index * 10}%` }} />
          ))}
        </div>
      </div>
      <TableLoading />
      <TableLoading pages />
    </div>
  );
}

function AnalyzeCardLoading() {
  const t = useTranslations("projectDomainOverview.workspace.analyze");
  return (
    <div
      className="min-w-0 rounded-card border border-border bg-bg-elev p-4.5 sm:p-5"
      data-skeleton="analyze-card"
    >
      <div className="grid gap-3.5">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-start">
          <Bar
            className="min-h-9 flex-1 sm:min-h-[34px] rounded-control border border-border md:min-w-[320px]"
            data-skeleton="target-control"
          />
          <div className="md:w-[230px]" data-skeleton="scope-wrapper">
            <Bar
              className="h-[34px] w-full rounded-control border border-border"
              data-skeleton="scope-control"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-4">
          <span className={`${pricingTriggerClassName} px-1.5 py-px`}>{t("pricing")}</span>
          <Bar className="h-[37px] min-w-[200px] rounded-control" data-skeleton="analyze-action" />
        </div>
        <div
          className="-mx-4.5 -mb-4.5 border-t border-border px-4.5 py-3.5 sm:-mx-5 sm:-mb-5 sm:px-5"
          data-skeleton="scope-footer"
        >
          <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted opacity-40">
            <InfoIcon weight="regular" aria-hidden size={14} />
            {t("scopeHelp")}
          </span>
        </div>
      </div>
    </div>
  );
}

function IdlePanelLoading() {
  const t = useTranslations("projectDomainOverview.workspace.state");
  const duration = useDomainOverviewCacheDuration();
  return (
    <ResearchIdleLoading
      title={t("idleTitle")}
      icon={GlobeIcon}
      bullets={[t("idleBullets.key"), t("idleBullets.cache", { duration }), t("idleBullets.track")]}
    />
  );
}

export function DomainOverviewPageLoading({ ariaLabel }: Readonly<{ ariaLabel: string }>) {
  return (
    <PageContent aria-hidden>
      <section aria-busy="true" aria-label={ariaLabel} className="grid min-w-0 gap-4">
        <AnalyzeCardLoading />
        <IdlePanelLoading />
      </section>
    </PageContent>
  );
}
