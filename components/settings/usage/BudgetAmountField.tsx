"use client";

import { compactInputTypographyClassName, inputClassName } from "@/components/ui/input-styles";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { cn } from "@/lib/ui/cn";
import { forwardRef, type InputHTMLAttributes } from "react";

type BudgetAmountFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  connection: ProviderSpendConnection;
  error?: string | null;
};

const fieldClassName = cn(
  inputClassName,
  compactInputTypographyClassName,
  "min-h-10 w-full min-w-0 flex-1 border-0 bg-transparent px-0 py-[9px] text-ui-body font-medium shadow-none outline-none focus:border-transparent focus:ring-0",
);

const adornmentClassName = "shrink-0 font-sans tabular-nums text-[12px] text-fg-muted select-none";

export const BudgetAmountField = forwardRef<HTMLInputElement, BudgetAmountFieldProps>(
  function BudgetAmountField({ connection, error, ...props }, ref) {
    const isMoney = connection.unit === "cents";
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
            placeholder="No budget"
            ref={ref}
          />
          {!isMoney ? <span className={cn(adornmentClassName, "pl-1.5")}>searches</span> : null}
        </div>
      </div>
    );
  },
);
