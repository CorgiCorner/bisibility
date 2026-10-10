"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { IdChip } from "@/components/ui/IdChip";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDisplayDateTime } from "@/lib/dates/format";
import type { ProjectRef } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RunPageSummary } from "./RunPageModel";
import type { RunPageData } from "./RunPageTypes";

type RunPageHeaderProps = {
  canMutate: boolean;
  onCancel: () => void;
  now: string;
  projectRef: ProjectRef;
  run: RunPageData;
  summary: RunPageSummary;
};

export function RunPageHeader({
  canMutate,
  onCancel,
  now,
  projectRef,
  run,
  summary,
}: Readonly<RunPageHeaderProps>) {
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectRuns.rankRuns");
  const tTimeline = useTranslations("projectRuns.timeline");
  const launchedIso = run.launchedAt ?? run.plannedFor;
  const launchedLabel = launchedIso
    ? formatDisplayDateTime(new Date(launchedIso), dateDisplay)
    : t("notStarted");
  const title =
    run.trigger === "scheduled"
      ? t("scheduledRun")
      : run.trigger === "retry"
        ? t("retryRun")
        : run.trigger === "api"
          ? t("api")
          : t("manualRun");
  const nextCheckRelative = run.nextCheckAt
    ? (() => {
        const minutes = Math.ceil(
          (new Date(run.nextCheckAt).getTime() - new Date(now).getTime()) / 60_000,
        );
        if (minutes <= 0) return t("relative.dueNow");
        if (minutes < 60) return t("relative.minutes", { count: minutes });
        if (minutes < 1_440) return t("relative.hours", { count: Math.ceil(minutes / 60) });
        return t("relative.days", { count: Math.ceil(minutes / 1_440) });
      })()
    : t("relative.notScheduled");

  return (
    <>
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-fg-muted no-underline hover:text-accent-text"
        href={projectRunsPath(projectRef)}
      >
        <ArrowLeft aria-hidden size={12} weight="regular" />
        {t("allRuns")}
      </Link>
      <section className="min-w-0 rounded-card border border-border bg-bg-elev">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="m-0 text-[17px] font-semibold leading-[1.3] tracking-[-0.3px] text-fg">
                {title}
              </h1>
              <StatusChip {...summary.runPresentation} live />
            </div>
            {run.blockedReason === "no_active_keywords" && run.status === "completed" ? (
              <p className="mt-1.5 text-[12.5px] text-fg-muted">{tTimeline("noActiveKeywords")}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
              <IdChip
                className="border-border bg-transparent"
                copyLabel={t("copyRunId", { id: run.id })}
                size="xs"
                value={run.id}
              />
              {run.requestedBy?.name ? (
                <span className="text-[12.5px] text-fg">{run.requestedBy.name}</span>
              ) : (
                <span className="font-mono">{t("scheduled")}</span>
              )}
              <span>{launchedLabel}</span>
              {run.status === "running" && run.nextCheckAt ? (
                <span>{t("nextCheck", { relative: nextCheckRelative })}</span>
              ) : null}
            </div>
          </div>
          {canMutate && summary.cancellable ? (
            <Button onClick={onCancel} size="xs" variant="secondary">
              {t("cancelRun")}
            </Button>
          ) : null}
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {summary.facts.map((fact) => (
            <div key={fact.label}>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
                {fact.label}
              </span>
              <span className="mt-[5px] block text-[12.5px] leading-[1.45] text-fg">
                {fact.value}
              </span>
              <span className="mt-[3px] block text-[10.5px] leading-[1.5] text-fg-muted">
                {fact.note}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
