"use client";

import { StatusChip, type StatusChipTone } from "@/components/ui/StatusChip";
import { Tooltip } from "@/components/ui/Tooltip";

type RunStatusChipProps = {
  description?: string;
  label: string;
  tone: StatusChipTone;
};

export function RunStatusChip({ description, label, tone }: Readonly<RunStatusChipProps>) {
  const chip = <StatusChip label={label} tone={tone} />;
  if (!description) return chip;
  return (
    <Tooltip content={description} semantics="description">
      <span className="inline-flex max-w-full cursor-help">{chip}</span>
    </Tooltip>
  );
}
