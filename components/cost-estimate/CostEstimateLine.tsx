import { formatChecks } from "@/components/marketing/calculator/calculator-shared";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { cn } from "@/lib/ui/cn";

export type CostEstimateLineProps = {
  budget?: { capCents: number; spentCents: number };
  checksPerMonth: number;
  className?: string;
  costCents?: number | null;
  deltaCents?: number | null;
};

function deltaLabel(cents: number) {
  const sign = cents > 0 ? "+" : cents < 0 ? "-" : "";
  return `${sign}${formatEstimateCents(Math.abs(cents))}/mo`;
}

export function CostEstimateLine({
  budget,
  checksPerMonth,
  className,
  costCents,
  deltaCents,
}: Readonly<CostEstimateLineProps>) {
  return (
    <p className={cn("m-0 font-mono text-xs leading-5 text-fg-muted", className)}>
      ~{formatChecks(checksPerMonth)} checks/mo
      {costCents == null ? null : (
        <>
          {" "}
          {"\u00b7"} ~{formatEstimateCents(costCents)}/mo
        </>
      )}
      {deltaCents == null ? null : <> ({deltaLabel(deltaCents)})</>}
      {budget ? (
        <>
          {" "}
          · {formatEstimateCents(budget.spentCents)} of {formatEstimateCents(budget.capCents)} this
          month
        </>
      ) : null}
    </p>
  );
}
