"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { type DateFormat, formatDateRange } from "@/lib/dates/format";
import type { ProviderRateData } from "@/lib/integrations/types";
import { cn } from "@/lib/ui/cn";

type RateSourceChipProps = Pick<ProviderRateData, "checkedAt" | "sampleSize" | "source" | "unit">;

const sourceClass = {
  list: "text-fg-muted",
  manual: "text-accent-text",
  measured: "text-green-text",
  unknown: "text-yellow-text",
} as const;

function listDate(checkedAt: string | undefined, dateFormat: DateFormat) {
  if (!checkedAt) return "";
  const key = checkedAt.slice(0, 10);
  return formatDateRange(key, key, dateFormat);
}

function sourceLabel(rate: RateSourceChipProps, dateFormat: DateFormat) {
  if (rate.source === "manual") return "your rate";
  if (rate.source === "measured") return `${rate.sampleSize ?? 0} ${rate.unit}`;
  if (rate.source === "list") return `list price, ${listDate(rate.checkedAt, dateFormat)}`;
  return "no rate yet";
}

export function RateSourceChip(rate: Readonly<RateSourceChipProps>) {
  const dateFormat = useDateFormat();
  return (
    <span
      className={cn("inline-flex items-center gap-[5px] text-[10px]", sourceClass[rate.source])}
    >
      <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-current" />
      {sourceLabel(rate, dateFormat)}
    </span>
  );
}
