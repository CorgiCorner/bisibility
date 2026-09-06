import { type SpendTone, spendFillClass } from "@/components/cost-estimate/spend-tone";
import { cn } from "@/lib/ui/cn";

type SpendBarProps = {
  ariaLabel: string;
  className: string;
  percent: number;
  roundedFill?: boolean;
  tone: SpendTone;
};

const meterRole = "meter" as const;

export function SpendBar({
  ariaLabel,
  className,
  percent,
  roundedFill = false,
  tone,
}: Readonly<SpendBarProps>) {
  return (
    <div
      aria-label={ariaLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className={cn("bg-meter-track", className)}
      role={meterRole}
    >
      <span
        className={`block h-full ${roundedFill ? "rounded-full " : ""}${spendFillClass[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
