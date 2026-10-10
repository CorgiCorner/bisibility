"use client";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { LEGACY_MODELS, LEGACY_OUTPUT_TOKENS } from "@/lib/ai-research/legacy";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import type { AiResearchForm } from "./AiVisibilityFields";

export function AiCostPolicyFields({
  form,
  catalog,
  disabled,
}: Readonly<{
  form: AiResearchForm;
  catalog?: AiResearchCatalog;
  disabled: boolean;
}>) {
  const t = useTranslations("projectAiResearch");
  const values = form.watch();
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  function choosePolicy(policy: string) {
    form.setValue("cost_policy", policy as "hard_cap" | "provider_actual_cost");
    form.unregister([
      "actual_cost_acknowledgement",
      "estimated_cost_limit_cents",
      "idempotency_key",
      "estimate_credentials_ref",
      "max_cost_cents",
    ]);
    if (policy === "provider_actual_cost") form.setValue("estimated_cost_limit_cents", 60);
    else {
      form.setValue("max_cost_cents", 60);
      form.setValue("models", [...LEGACY_MODELS]);
      form.setValue("max_output_tokens", LEGACY_OUTPUT_TOKENS);
      form.setValue("web_search", false);
      form.setValue("response_language", "en");
      form.setValue("country_iso_code", undefined);
    }
  }
  return (
    <>
      <div className="grid gap-2 text-ui-body sm:col-span-2">
        <span>{t("costPolicy")}</span>
        <MenuSelect
          ariaLabel={t("costPolicy")}
          size="input"
          value={actual ? "provider_actual_cost" : "hard_cap"}
          disabled={disabled}
          onChange={choosePolicy}
          options={[
            { value: "hard_cap", label: t("hardCapPolicy") },
            {
              value: "provider_actual_cost",
              label: t("actualCostPolicy"),
              disabled: !catalog?.actualCostAvailable,
            },
          ]}
        />
        {actual || !catalog?.actualCostAvailable ? (
          <span className="text-ui-xs text-fg-muted">
            {t(
              actual && catalog?.actualCostAvailable
                ? "actualCostOwnCredentials"
                : "actualCostUnavailable",
            )}
          </span>
        ) : null}
      </div>
      {actual ? (
        <Controller
          name="actual_cost_acknowledgement"
          control={form.control}
          render={({ field }) => (
            <Checkbox
              containerClassName="sm:col-span-2"
              label={t("actualCostAcknowledgement")}
              aria-label={t("actualCostAcknowledgement")}
              description={t("actualCostRisk")}
              checked={field.value === "non_guaranteed_estimate_v1"}
              disabled={disabled}
              onChange={(event) =>
                field.onChange(event.target.checked ? "non_guaranteed_estimate_v1" : undefined)
              }
            />
          )}
        />
      ) : null}
      <label htmlFor="ai-cost-limit" className="grid gap-2 text-ui-body">
        {t(actual ? "estimatedCostLimit" : "costCap")}
        <Input
          id="ai-cost-limit"
          type="number"
          min={0}
          max={1000}
          disabled={disabled}
          {...form.register(actual ? "estimated_cost_limit_cents" : "max_cost_cents", {
            valueAsNumber: true,
          })}
        />
      </label>
    </>
  );
}
