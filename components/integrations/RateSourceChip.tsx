import type { ProviderRateData } from "@/lib/integrations/types";
import { cn } from "@/lib/ui/cn";

type RateSourceChipProps = Pick<ProviderRateData, "checkedAt" | "sampleSize" | "source" | "unit">;

const sourceClass = {
  list: "text-fg-muted",
  manual: "text-accent-text",
  measured: "text-green-text",
  unknown: "text-yellow-text",
} as const;

function listDate(checkedAt: string | undefined) {
  if (!checkedAt) return "";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(checkedAt));
}

function sourceLabel(rate: RateSourceChipProps) {
  if (rate.source === "manual") return "your rate";
  if (rate.source === "measured") return `${rate.sampleSize ?? 0} ${rate.unit}`;
  if (rate.source === "list") return `list price, ${listDate(rate.checkedAt)}`;
  return "no rate yet";
}

export function RateSourceChip(rate: Readonly<RateSourceChipProps>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] font-mono text-[10px]",
        sourceClass[rate.source],
      )}
    >
      <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-current" />
      {sourceLabel(rate)}
    </span>
  );
}
