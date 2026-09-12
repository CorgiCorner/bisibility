import { formatChecks } from "@/components/marketing/calculator/calculator-shared";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { hasMonthlyBudgetCap } from "@/lib/rank-check/budget-contract";
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
    <p className={cn("m-0 font-sans tabular-nums text-xs leading-5 text-fg-muted", className)}>
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
          {"·"}{" "}
          {hasMonthlyBudgetCap(budget.capCents)
            ? `${formatEstimateCents(budget.spentCents)} of ${formatEstimateCents(budget.capCents)} this month`
            : `${formatEstimateCents(budget.spentCents)} this month`}
        </>
      ) : null}
    </p>
  );
}
