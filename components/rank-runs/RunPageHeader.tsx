"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { Button, IdChip, StatusChip, shortId } from "@/components/ui";
import { formatDateTime } from "@/lib/dates/format";
import { relativeFuture } from "@/lib/format/relative-time";
import { type ProjectRef, rankTrackerTabPath } from "@/lib/routing/app-path";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
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

function titleForTrigger(trigger: RunPageData["trigger"]): string {
  if (trigger === "scheduled") return "Scheduled run";
  if (trigger === "retry") return "Retry run";
  return "Manual run";
}

export function RunPageHeader({
  canMutate,
  onCancel,
  now,
  projectRef,
  run,
  summary,
}: Readonly<RunPageHeaderProps>) {
  const dateFormat = useDateFormat();
  const launchedIso = run.launchedAt ?? run.plannedFor;
  const launchedLabel = launchedIso
    ? formatDateTime(new Date(launchedIso), dateFormat)
    : "Not started";

  return (
    <>
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-fg-muted no-underline hover:text-accent-text"
        href={rankTrackerTabPath(projectRef, "runs")}
      >
        <ArrowLeft aria-hidden size={12} weight="regular" />
        All runs
      </Link>
      <section className="min-w-0 rounded-card border border-border bg-bg-elev">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="m-0 text-[17px] font-semibold leading-[1.3] tracking-[-0.3px] text-fg">
                {titleForTrigger(run.trigger)}
              </h1>
              <StatusChip
                label={summary.runPresentation.label}
                live
                tone={summary.runPresentation.tone}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
              <IdChip
                className="border-border bg-transparent"
                copyLabel={`Copy run ID ${run.id}`}
                displayValue={shortId(run.id)}
                size="xs"
                value={run.id}
              />
              {run.requestedBy?.name ? (
                <span className="text-[12.5px] text-fg">{run.requestedBy.name}</span>
              ) : (
                <span className="font-mono">schedule</span>
              )}
              <span>{launchedLabel}</span>
              {run.status === "running" && run.nextCheckAt ? (
                <span>Next check {relativeFuture(new Date(run.nextCheckAt), new Date(now))}</span>
              ) : null}
            </div>
          </div>
          {canMutate && summary.cancellable ? (
            <Button onClick={onCancel} size="xs" variant="secondary">
              Cancel run
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
