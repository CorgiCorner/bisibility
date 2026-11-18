"use client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { UsageChevron, UsageReveal } from "@/components/usagekit/usage-motion";
import type { CostFormValues } from "@/lib/cost-items/input";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ErrorText, Field } from "./CostFormField";

export function CostPriceChanges({ form }: Readonly<{ form: UseFormReturn<CostFormValues> }>) {
  const t = useTranslations("projectUsageCosts.drawer");
  const values = form.watch();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const errors = form.formState.errors;
  const open =
    expanded || Boolean(errors.trialUntil || errors.discountAmount || errors.discountPercent);
  return (
    <section className="grid min-w-0 gap-2">
      <Button
        size="input"
        variant="outline"
        type="button"
        className="justify-self-start"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setExpanded(!open)}
      >
        {t("priceChanges")}
        <UsageChevron open={open} />
      </Button>
      <UsageReveal open={open} id={id}>
        <div className="grid gap-4 pt-2">
          <Field label={t("trialUntil")} error={errors.trialUntil?.message}>
            <Input aria-label={t("trialUntil")} type="date" {...form.register("trialUntil")} />
          </Field>
          <Field label={t("discount")}>
            <SegmentedControl
              ariaLabel={t("discount")}
              onChange={(mode) => form.setValue("discountMode", mode)}
              options={[
                { label: t("none"), value: "none" },
                { label: t("percent"), value: "percent" },
                { label: t("money"), value: "amount" },
              ]}
              size="field"
              value={values.discountMode}
            />
            {values.discountMode === "none" ? null : (
              <DiscountFields error={errors.discountAmount?.message} form={form} values={values} />
            )}
          </Field>
        </div>
      </UsageReveal>
    </section>
  );
}

function DiscountFields({
  error,
  form,
  values,
}: Readonly<{ error?: string; form: UseFormReturn<CostFormValues>; values: CostFormValues }>) {
  const t = useTranslations("projectUsageCosts.drawer");
  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-invalid={Boolean(error)}
        aria-label={values.discountMode === "percent" ? t("percent") : t("money")}
        inputMode="decimal"
        {...form.register(values.discountMode === "percent" ? "discountPercent" : "discountAmount")}
      />
      <SegmentedControl
        ariaLabel={t("discount")}
        onChange={(span) => form.setValue("discountSpan", span)}
        options={[
          { label: t("forMonths"), value: "months" },
          { label: t("untilDate"), value: "until" },
        ]}
        size="field"
        value={values.discountSpan}
      />
      {values.discountSpan === "months" ? (
        <Input aria-label={t("months")} inputMode="numeric" {...form.register("discountMonths")} />
      ) : (
        <Input aria-label={t("untilDate")} type="date" {...form.register("discountUntil")} />
      )}
      <ErrorText code={error} />
    </div>
  );
}
