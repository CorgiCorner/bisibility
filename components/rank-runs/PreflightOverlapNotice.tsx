"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDisplayRelativeDay } from "@/lib/dates/format";
import type { RankCheckRunOverlap } from "@/lib/rank-check/runs/preview-overlaps";
import { asProjectRef } from "@/lib/routing/app-path";
import { projectRunRankCheckPath, projectRunsPath } from "@/lib/routing/project-runs-path";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type CancelOverlappingRunAction = (input: {
  projectId: string;
  runId: string;
  status: RankCheckRunOverlap["status"];
}) => Promise<void>;

type PreflightOverlapNoticeProps = {
  cancelAction?: CancelOverlappingRunAction;
  disabled: boolean;
  onCancelled: () => Promise<void>;
  overlapRunCount: number;
  overlaps: readonly RankCheckRunOverlap[];
  projectId: string;
};

function plannedTime(at: string, context: ReturnType<typeof useDateDisplay>) {
  const date = new Date(at);
  const clock = new Intl.DateTimeFormat(context.locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: context.timeZone,
  }).format(date);
  return `${formatDisplayRelativeDay(date, new Date(), context)} ${clock}`;
}

/** Non-blocking: the run still starts, the operator only learns what it would pay for twice. */
export function PreflightOverlapNotice({
  cancelAction,
  disabled,
  onCancelled,
  overlapRunCount,
  overlaps,
  projectId,
}: Readonly<PreflightOverlapNoticeProps>) {
  const t = useTranslations("shared.rankPreflight");
  const dateDisplay = useDateDisplay();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soonest = overlaps[0];
  if (!soonest) return null;
  const project = asProjectRef(projectId);
  const canCancel = soonest.canCancel && Boolean(cancelAction);
  const more = Math.max(overlapRunCount, overlaps.length) - 1;
  const runHref =
    soonest.status === "planned"
      ? projectRunsPath(project, { view: "planned" })
      : projectRunRankCheckPath(project, soonest.runId);

  async function cancel() {
    if (!cancelAction || !soonest) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelAction({ projectId, runId: soonest.runId, status: soonest.status });
      await onCancelled();
    } catch {
      setError(t("couldNotCancel"));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div
      aria-label={t("alreadyScheduled")}
      className="flex items-center gap-3 rounded-control border border-border bg-bg-sunken px-3.5 py-3"
      role="status"
    >
      <div className="grid min-w-0 flex-1 justify-items-start gap-1.5">
        <StatusChip dot label={t("alreadyScheduled")} tone="info" />
        <p className="m-0 text-[12.5px] leading-5 text-fg">
          {t("overlapMessage", {
            count: soonest.keywordCount,
            status: soonest.status,
            time: soonest.status === "planned" ? plannedTime(soonest.at, dateDisplay) : "",
          })}{" "}
          {canCancel ? t("overlapCancelHint") : t("overlapKeepHint")}
        </p>
        {more > 0 ? (
          <Link
            className="text-[12px] font-medium text-fg-muted no-underline hover:text-accent-text"
            href={projectRunsPath(project)}
          >
            {t("overlapMore", { count: more })}
          </Link>
        ) : null}
        {error ? (
          <p className="m-0 text-[12px] leading-5 text-red-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canCancel ? (
          <Button
            disabled={disabled}
            loading={cancelling}
            loadingLabel={t("cancellingRun")}
            onClick={() => void cancel()}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("cancelRun")}
          </Button>
        ) : null}
        <Button href={runHref} size="sm" variant="secondary">
          {t("openRun")}
        </Button>
      </div>
    </div>
  );
}
