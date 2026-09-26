"use client";

import { compactInputTypographyClassName, inputClassName } from "@/components/ui/input-styles";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";
import { forwardRef, type InputHTMLAttributes } from "react";

type BudgetAmountFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  error?: string | null;
  /** Money budgets show a dollar adornment; unit budgets show searches. */
  unit: "cents" | "units";
};

const fieldClassName = cn(
  inputClassName,
  compactInputTypographyClassName,
  "min-h-10 w-full min-w-0 flex-1 border-0 bg-transparent px-0 py-[9px] text-ui-body font-medium shadow-none outline-none focus:border-transparent focus:ring-0",
);

const adornmentClassName = "shrink-0 font-sans tabular-nums text-[12px] text-fg-muted select-none";

export const BudgetAmountField = forwardRef<HTMLInputElement, BudgetAmountFieldProps>(
  function BudgetAmountField({ error, unit, ...props }, ref) {
    const isMoney = unit === "cents";
    const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
    return (
      <div className="min-w-0">
        <div
          className={cn(
            "flex min-h-10 w-full items-center overflow-hidden rounded-control border bg-transparent px-[13px]",
            error ? "border-red" : "border-border-control focus-within:border-accent",
          )}
        >
          {isMoney ? <span className={cn(adornmentClassName, "pr-1")}>$</span> : null}
          <input
            {...props}
            aria-invalid={error ? true : undefined}
            className={fieldClassName}
            inputMode={isMoney ? "decimal" : "numeric"}
            placeholder={t("placeholder")}
            ref={ref}
          />
          {!isMoney ? (
            <span className={cn(adornmentClassName, "pl-1.5")}>{t("searchesAdornment")}</span>
          ) : null}
        </div>
      </div>
    );
  },
);
