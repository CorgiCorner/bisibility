"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { type DateFormat, formatDateRange } from "@/lib/dates/format";
import type { ProviderRateData } from "@/lib/integrations/types";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";

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

export function RateSourceChip(rate: Readonly<RateSourceChipProps>) {
  const t = useTranslations("projectIntegrations.rates");
  const dateFormat = useDateFormat();
  const label =
    rate.source === "manual"
      ? t("yourRate")
      : rate.source === "measured"
        ? t("measured", { count: rate.sampleSize ?? 0, unit: rate.unit })
        : rate.source === "list"
          ? t("listPrice", { date: listDate(rate.checkedAt, dateFormat) })
          : t("noRate");
  return (
    <span
      className={cn("inline-flex items-center gap-[5px] text-[10px]", sourceClass[rate.source])}
    >
      <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-current" />
      {label}
    </span>
  );
}
