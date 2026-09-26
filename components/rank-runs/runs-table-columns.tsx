"use client";

import type { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { RunStatusChip } from "@/components/project-runs/RunStatusChip";
import type { RunStatusCopyApi } from "@/components/project-runs/run-status-copy";
import type { ClientDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { nativeUsageUnit } from "@/lib/cost-estimate/native-usage";
import type { DateFormat } from "@/lib/dates/format";
import { formatDateTimeCurrentYear } from "@/lib/dates/format";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { projectRunRankCheckPath, projectRunsPath } from "@/lib/routing/project-runs-path";
import { rankRunStatusKey } from "@/lib/runs/run-status-vocabulary";
import Link from "next/link";
import type { useTranslations } from "next-intl";
import { localizedBlockedRunCopy } from "./rank-run-copy";
import { isSkippedOccurrence } from "./runs-format";
import { launchedBy, NextCheckLine, RunActor } from "./runs-table-cells";
import type { RankRunRecord } from "./runs-types";

type RunsTableColumnsOptions = {
  usage: ReturnType<typeof useNativeUsageFormat>;
  dateFormat: DateFormat;
  deploymentMode: ClientDeploymentMode;
  locale: string;
  projectRef: string;
  statusCopy: RunStatusCopyApi;
  statusT: ReturnType<typeof useTranslations<"shared.controls.status">>;
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>;
};

export type RunsTableRow = { id: string; kind: "row"; run: RankRunRecord };

export function rankRunHref(projectRef: string, publicId: string): string {
  return isPublicIdOfType(publicId, "rcr")
    ? projectRunRankCheckPath(projectRef, publicId)
    : projectRunsPath(projectRef);
}

function triggerLabel(
  run: RankRunRecord,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
) {
  if (run.trigger === "scheduled") return t("scheduled");
  if (run.trigger === "manual") return t("manualRun");
  if (run.trigger === "retry") return t("retry");
  return t("api");
}

export function runsTableColumns({
  usage,
  dateFormat,
  deploymentMode,
  locale,
  projectRef,
  statusCopy,
  statusT,
  t,
}: RunsTableColumnsOptions): readonly DataTableColumn<RunsTableRow>[] {
  const money = (cents: number | null) =>
    cents === null
      ? t("unavailable")
      : new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(cents / 100);
  const statusPresentation = (run: RankRunRecord) =>
    isSkippedOccurrence(run)
      ? { label: statusT("skipped"), tone: "neutral" as const }
      : statusCopy.rank(rankRunStatusKey(run.status, run.outcome));
  const selection = (run: RankRunRecord) => {
    switch (run.selectionKind) {
      case "all":
        return t("selectionKinds.all");
      case "filter":
        return t("selectionKinds.filter");
      case "legacy_schedule":
        return t("selectionKinds.legacy_schedule");
      case "rerun":
        return t("selectionKinds.rerun");
      case "retry_failed":
        return t("selectionKinds.retry_failed");
      case "scheduled_due":
        return t("selectionKinds.scheduled_due");
      case "selected":
        return t("selectionKinds.selected");
      case "single":
        return t("selectionKinds.single");
    }
  };
  const runCounts = (run: RankRunRecord) => {
    const processed =
      run.counts.completed + run.counts.deferred + run.counts.failed + run.counts.cancelled;
    return t("table.progressValue", { processed, total: run.counts.total });
  };
  const duration = (run: RankRunRecord) => {
    if (!run.startedAt) return t("unavailable");
    if (!run.finishedAt) return t("inProgress");
    const seconds = Math.max(
      1,
      Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1_000),
    );
    return seconds < 60
      ? t("durationSeconds", { count: seconds })
      : t("durationMinutes", { count: Math.round(seconds / 60) });
  };
  return [
    {
      accessorFn: (row) => triggerLabel(row.run, t),
      cell: ({ row }) => {
        const run = row.original.run;
        const href = rankRunHref(projectRef, run.id);
        return (
          <div className="min-w-0">
            <Link
              className={`block w-fit text-[12.5px] font-semibold ${dataLinkClassName}`}
              href={href}
            >
              {triggerLabel(run, t)}
            </Link>
            <IdChip
              className="mt-0.5 max-w-full border-border bg-transparent"
              copyLabel={t("copyRunId", { id: run.id })}
              size="xs"
              value={run.id}
            />
          </div>
        );
      },
      enableSorting: false,
      header: t("run"),
      id: "actions",
      meta: { flex: 1.4, lockResize: true, title: t("run") },
      minSize: 216,
      size: 256,
    },
    {
      accessorFn: (row) => launchedBy(row.run, t),
      cell: ({ row }) => <RunActor run={row.original.run} />,
      enableSorting: false,
      header: t("launchedBy"),
      id: "launchedBy",
      meta: { flex: 0.4, lockResize: true, title: t("launchedBy") },
      minSize: 168,
      size: 176,
    },
    {
      accessorFn: (row) => selection(row.run),
      cell: ({ row }) => {
        const run = row.original.run;
        return (
          <div className="min-w-0">
            <span className="block leading-[1.45] text-fg">{selection(run)}</span>
            {run.targetCount > run.keywordCount ? (
              <span className="mt-0.5 block text-[10.5px] text-fg-muted">
                {t("keywordsAndTargets", { keywords: run.keywordCount, targets: run.targetCount })}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: t("selection"),
      id: "targetSelection",
      meta: { flex: 0.8, lockResize: true, title: t("selection") },
      minSize: 184,
      size: 200,
    },
    {
      accessorFn: (row) => runCounts(row.run),
      cell: ({ row }) => {
        const run = row.original.run;
        const status = statusPresentation(run);
        const blocked =
          run.status === "blocked"
            ? localizedBlockedRunCopy(
                {
                  budget: run.budget,
                  deploymentMode,
                  reason: run.blockedReason,
                },
                t,
                locale,
              )
            : null;
        return (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <RunStatusChip {...status} />
              <span className="text-[10.5px] tabular-nums text-fg-muted">{runCounts(run)}</span>
            </div>
            <NextCheckLine run={run} />
            {blocked ? (
              <span className="mt-1.5 block text-[11px] leading-[1.45] text-fg-muted">
                {blocked.compact}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: t("progress"),
      id: "progress",
      meta: { flex: 0.9, lockResize: true, title: t("progress") },
      minSize: 200,
      size: 216,
    },
    {
      accessorFn: (row) => row.run.costCents,
      cell: ({ row }) => {
        const run = row.original.run;
        const skipped = isSkippedOccurrence(run);
        const planned =
          run.status === "planned" ||
          run.status === "queued" ||
          (run.status === "blocked" && run.startedAt === null);
        return (
          <div>
            <span className="block">
              {run.usage || nativeUsageUnit(run.provider) === "units"
                ? usage.format({
                    unit: "units",
                    quantity: planned
                      ? (run.nativeEstimate?.quantity ?? run.usage?.estimated ?? null)
                      : (run.usage?.actual ?? null),
                  })
                : planned && run.nativeEstimate
                  ? usage.format(run.nativeEstimate)
                  : money(skipped ? 0 : planned ? run.estimatedCostCents : run.costCents)}
            </span>
            <span className="mt-0.5 block text-[10.5px] text-fg-muted">
              {skipped ? t("nothingBilled") : planned ? t("facts.estimate") : t("facts.actual")}
            </span>
          </div>
        );
      },
      enableSorting: false,
      header: usage.label,
      id: "cost",
      meta: { align: "end", lockResize: true, title: usage.label },
      minSize: 96,
      size: 104,
    },
    {
      accessorFn: (row) => row.run.startedAt ?? "",
      cell: ({ row }) => {
        const { startedAt } = row.original.run;
        return startedAt
          ? formatDateTimeCurrentYear(new Date(startedAt), dateFormat, new Date())
          : t("notStarted");
      },
      enableSorting: false,
      header: t("started"),
      id: "started",
      meta: { lockResize: true, title: t("started") },
      minSize: 148,
      size: 156,
    },
    {
      accessorFn: (row) => duration(row.run),
      cell: ({ row }) => duration(row.original.run),
      enableSorting: false,
      header: t("duration"),
      id: "duration",
      meta: { align: "end", lockResize: true, title: t("duration") },
      minSize: 96,
      size: 100,
    },
    {
      accessorFn: (row) => row.run.parentRunId ?? "",
      cell: ({ row }) =>
        row.original.run.parentRunId ? (
          <span className="inline-flex items-center gap-1">
            {t("from")}
            <IdChip
              className="border-0 bg-transparent px-0"
              copyLabel={t("copyParentRunId")}
              size="xs"
              value={row.original.run.parentRunId}
            />
          </span>
        ) : null,
      enableSorting: false,
      header: "",
      id: "relatedRun",
      meta: { flex: 0.3, lockResize: true },
      minSize: 148,
      size: 156,
    },
  ];
}
