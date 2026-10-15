"use client";

// Rendered both by the client workspace and by the route-level loading.tsx, which mounts
// BacklinksMessagesBoundary around it. Either way `projectBacklinks` is a client payload.

import { ResearchIdleLoading } from "@/components/research/ResearchIdleLoading";
import { PageContent } from "@/components/shell/PageContent";
import { pricingTriggerClassName } from "@/components/ui/PricingPopover";
import { cn } from "@/lib/ui/cn";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { useTranslations } from "next-intl";
import type { ComponentPropsWithoutRef } from "react";

function Bar({ className, ...props }: Readonly<ComponentPropsWithoutRef<"div">>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} {...props} />;
}

const summaryKeys = ["authority", "backlinks", "domains", "spam"] as const;
const tableHeaderKeys = ["source", "target", "anchor", "authority", "first-seen"] as const;
const tableRowKeys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;

function AnalyzeCardLoading() {
  const t = useTranslations("projectBacklinks.workspace.analyze");
  return (
    <div
      className="min-w-0 rounded-card border border-border bg-bg-elev p-4 sm:p-5"
      data-testid="backlinks-analyze-loading"
    >
      <div className="grid gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <Bar className="min-h-9 flex-1 sm:min-h-[34px] rounded-control border border-border md:min-w-[240px]" />
          <Bar className="h-[34px] md:w-[196px]" />
          <Bar className="min-h-[34px] lg:w-[132px]" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bar className="h-5 w-9 rounded-full" />
            <span className="text-[12.5px] opacity-40">{t("includeSubdomains")}</span>
            <Bar className="size-6 rounded-full" />
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-4">
            <span className={`${pricingTriggerClassName} px-1.5 py-px`}>{t("pricing")}</span>
            <Bar className="h-9 min-w-[216px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function IdleStateLoading() {
  const t = useTranslations("projectBacklinks.workspace.idle");
  return (
    <ResearchIdleLoading
      icon={LinkIcon}
      title={t("idleTitle")}
      bullets={[t("bullets.price"), t("bullets.cache"), t("bullets.diff")]}
    />
  );
}

function ResultsTableLoading() {
  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
        <Bar className="h-8 w-[86px]" />
        <Bar className="h-3 w-[210px]" />
        <Bar className="ml-auto h-8 w-[84px]" />
      </div>
      <div className="min-w-0 overflow-x-auto">
        <div className="min-w-[840px]">
          <div className="grid h-[42px] grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_minmax(160px,1fr)_92px_112px] items-center gap-4 border-b border-border bg-table-header-bg px-4">
            {tableHeaderKeys.map((key, index) => (
              <Bar className={cn("h-2.5 bg-border", index === 0 ? "w-[82px]" : "w-11")} key={key} />
            ))}
          </div>
          {tableRowKeys.map((key, index) => (
            <div
              className={cn(
                "grid h-[58px] grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_minmax(160px,1fr)_92px_112px] items-center gap-4 px-4",
                index < tableRowKeys.length - 1 && "border-b border-border",
              )}
              key={key}
            >
              <Bar className={cn("h-3.5", index % 2 === 0 ? "w-[72%]" : "w-[58%]")} />
              <Bar className="h-3 w-[68%]" />
              <Bar className="h-3 w-[62%]" />
              <Bar className="h-6 w-10 rounded-full" />
              <Bar className="h-3 w-[74px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BacklinksResultsLoading() {
  const t = useTranslations("projectBacklinks.workspace.snapshot");
  return (
    <div aria-label={t("loadingAria")} className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Bar className="h-7 w-[142px] rounded-full" />
        <Bar className="h-3 w-[268px]" />
        <Bar className="h-6 w-[148px] rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryKeys.map((key) => (
          <div className="rounded-card border border-border bg-bg-elev p-4" key={key}>
            <Bar className="h-2.5 w-20" />
            <Bar className="mt-3 h-6 w-16" />
          </div>
        ))}
      </div>
      <ResultsTableLoading />
    </div>
  );
}

export function BacklinksPageLoading() {
  return (
    <PageContent aria-hidden>
      <section className="grid min-w-0 gap-4" data-testid="backlinks-workspace-loading">
        <AnalyzeCardLoading />
        <IdleStateLoading />
      </section>
    </PageContent>
  );
}
