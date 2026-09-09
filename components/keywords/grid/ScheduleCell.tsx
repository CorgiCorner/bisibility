"use client";

import { MarketLabel } from "@/components/schedules/MarketLabel";
import { Tooltip } from "@/components/ui/Tooltip";
import { type ScheduleReference, scheduleRowLabel } from "@/lib/schedules/mixed-state";

export type ScheduleCellTarget = {
  device: string;
  id: string;
  location: string;
  schedule: ScheduleReference | null;
};

type ScheduleCellProps = { targets: readonly ScheduleCellTarget[] };

function isMixedSchedule(label: string) {
  return label.startsWith("Mixed - ");
}

function targetLabel(target: ScheduleCellTarget) {
  return target.schedule?.name ?? "Manual";
}

function ScheduleTooltip({ targets }: Readonly<ScheduleCellProps>) {
  return (
    <span className="grid gap-1 text-left">
      {targets.map((target) => (
        <span key={target.id}>
          <MarketLabel device={target.device} location={target.location} /> - {targetLabel(target)}
        </span>
      ))}
    </span>
  );
}

export function ScheduleCell({ targets }: Readonly<ScheduleCellProps>) {
  const label = scheduleRowLabel(targets);
  const textClassName =
    label === "Manual"
      ? "block truncate text-[12.5px] font-medium text-fg-muted"
      : "block truncate text-[12.5px] font-medium text-fg";

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      {isMixedSchedule(label) ? (
        <Tooltip content={<ScheduleTooltip targets={targets} />} semantics="description">
          <span className={`${textClassName} cursor-help`}>{label}</span>
        </Tooltip>
      ) : (
        <span className={textClassName}>{label}</span>
      )}
    </span>
  );
}
