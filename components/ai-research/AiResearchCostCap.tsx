"use client";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/ui/cn";
import { useLocale, useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import type { AiResearchForm } from "./AiVisibilityFields";

export function AiResearchCostCap({
  form,
  disabled = false,
  advisory = false,
  className,
}: Readonly<{
  form: AiResearchForm;
  disabled?: boolean;
  advisory?: boolean;
  className?: string;
}>) {
  const t = useTranslations("projectAiResearch");
  const locale = useLocale();
  return (
    <div className={cn("grid w-full gap-2 text-ui-body", className)}>
      <Controller
        name={advisory ? "estimated_cost_limit_cents" : "max_cost_cents"}
        control={form.control}
        render={({ field }) => (
          <label htmlFor="ai-cost-limit" className="grid gap-2">
            {t(advisory ? "estimatedCostLimit" : "costCap")}
            <Input
              className="max-w-40"
              id="ai-cost-limit"
              aria-label={t(advisory ? "estimatedCostLimit" : "costCap")}
              aria-describedby="ai-cost-hint"
              type="number"
              min={0}
              max={10}
              step={0.01}
              disabled={disabled}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={Number.isFinite(field.value) ? (field.value as number) / 100 : ""}
              onChange={(event) =>
                field.onChange(
                  event.target.value === ""
                    ? Number.NaN
                    : Math.round(Number(event.target.value) * 100),
                )
              }
            />
            <span id="ai-cost-hint" className="text-ui-caption text-fg-muted">
              {t(advisory ? "advisoryAmountHint" : "maximumAmountHint", {
                amount: new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: "USD",
                }).format((Number.isFinite(field.value) ? (field.value as number) : 0) / 100),
              })}
            </span>
          </label>
        )}
      />
    </div>
  );
}
