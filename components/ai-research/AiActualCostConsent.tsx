"use client";
import { Checkbox } from "@/components/ui/Checkbox";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import type { AiResearchForm } from "./AiVisibilityFields";

export function AiActualCostConsent({
  form,
  disabled,
  detailed = false,
}: Readonly<{ form: AiResearchForm; disabled: boolean; detailed?: boolean }>) {
  const t = useTranslations("projectAiResearch");
  return (
    <Controller
      name="actual_cost_acknowledgement"
      control={form.control}
      render={({ field }) => (
        <Checkbox
          containerClassName="sm:col-span-2"
          label={t("actualCostAcknowledgement")}
          aria-label={t("actualCostAcknowledgement")}
          description={detailed ? t("actualCostRisk") : undefined}
          checked={field.value === "non_guaranteed_estimate_v1"}
          disabled={disabled}
          onChange={(event) =>
            field.onChange(event.target.checked ? "non_guaranteed_estimate_v1" : undefined)
          }
        />
      )}
    />
  );
}
