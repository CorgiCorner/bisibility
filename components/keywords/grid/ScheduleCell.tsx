"use client";

import { MarketLabel } from "@/components/schedules/MarketLabel";
import { Tooltip } from "@/components/ui/Tooltip";
import { type ScheduleReference, scheduleRowState } from "@/lib/schedules/mixed-state";
import { useTranslations } from "next-intl";

export type ScheduleCellTarget = {
  device: string;
  id: string;
  location: string;
  schedule: ScheduleReference | null;
};

type ScheduleCellProps = { targets: readonly ScheduleCellTarget[] };

function targetLabel(target: ScheduleCellTarget, manualLabel: string) {
  return target.schedule?.name ?? manualLabel;
}

function ScheduleTooltip({
  manualLabel,
  targets,
}: Readonly<ScheduleCellProps & { manualLabel: string }>) {
  return (
    <span className="grid gap-1 text-left">
      {targets.map((target) => (
        <span key={target.id}>
          <MarketLabel device={target.device} location={target.location} /> -{" "}
          {targetLabel(target, manualLabel)}
        </span>
      ))}
    </span>
  );
}

export function ScheduleCell({ targets }: Readonly<ScheduleCellProps>) {
  const t = useTranslations("projectRankTracker.list");
  const state = scheduleRowState(targets);
  const label =
    state.kind === "manual"
      ? t("scheduleManual")
      : state.kind === "mixed"
        ? t("scheduleMixed", { count: state.scheduleCount })
        : state.name;
  const textClassName =
    state.kind === "manual"
      ? "block truncate text-[12.5px] font-medium text-fg-muted"
      : "block truncate text-[12.5px] font-medium text-fg";

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      {state.kind === "mixed" ? (
        <Tooltip
          content={<ScheduleTooltip manualLabel={t("scheduleManual")} targets={targets} />}
          semantics="description"
        >
          <span className={`${textClassName} cursor-help`}>{label}</span>
        </Tooltip>
      ) : (
        <span className={textClassName}>{label}</span>
      )}
    </span>
  );
}
