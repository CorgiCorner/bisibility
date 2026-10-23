"use client";
import { Input } from "@/components/ui/Input";
import { useTranslations } from "next-intl";
import type { AiResearchForm } from "./AiVisibilityFields";

export function AiResearchCostCap({
  form,
  disabled = false,
}: Readonly<{ form: AiResearchForm; disabled?: boolean }>) {
  const t = useTranslations("projectAiResearch");
  return (
    <label htmlFor="ai-cost-limit" className="grid gap-2 text-ui-body">
      {t("costCap")}
      <Input
        id="ai-cost-limit"
        type="number"
        min={0}
        max={1000}
        disabled={disabled}
        {...form.register("max_cost_cents", { valueAsNumber: true })}
      />
    </label>
  );
}
