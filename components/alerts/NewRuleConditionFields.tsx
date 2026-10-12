"use client";

import { Input } from "@/components/ui/Input";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { useTranslations } from "next-intl";
import type { FieldErrors, UseFormRegister, UseFormRegisterReturn } from "react-hook-form";

const labelClass =
  "flex flex-col gap-[7px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export function ConditionFields(
  props: Readonly<{
    conditionType: NewRuleForm["conditionType"];
    errors: FieldErrors<NewRuleForm>;
    register: UseFormRegister<NewRuleForm>;
  }>,
) {
  return (
    <div className="h-[100px] min-w-0" data-alert-condition-slot="">
      <ConditionalField {...props} />
    </div>
  );
}

function ConditionalField({
  conditionType,
  errors,
  register,
}: Readonly<{
  conditionType: NewRuleForm["conditionType"];
  errors: FieldErrors<NewRuleForm>;
  register: UseFormRegister<NewRuleForm>;
}>) {
  const t = useTranslations("projectAlerts.drawer");

  if (conditionType === "change_pct" || conditionType === "ctr_drop") {
    return (
      <NumberField
        error={errors.changePct?.message}
        label={conditionType === "ctr_drop" ? t("ctrDrop") : t("changePct")}
        max={conditionType === "ctr_drop" ? 100 : undefined}
        register={register("changePct")}
        step={0.1}
      />
    );
  }
  if (conditionType === "threshold") {
    return (
      <NumberField
        error={errors.thresholdPosition?.message}
        label={t("thresholdPosition")}
        register={register("thresholdPosition")}
      />
    );
  }
  if (conditionType === "position_drop") {
    return (
      <NumberField
        error={errors.dropPositions?.message}
        label={t("dropPositions")}
        register={register("dropPositions")}
      />
    );
  }
  if (conditionType === "competitor_overtake") {
    return (
      <TextField
        error={errors.competitorDomain?.message}
        label={t("competitorDomain")}
        register={register("competitorDomain")}
      />
    );
  }
  if (conditionType === "serp_feature") {
    return (
      <TextField
        error={errors.serpFeature?.message}
        label={t("serpFeature")}
        register={register("serpFeature")}
      />
    );
  }
  if (conditionType === "url_mismatch" || conditionType === "downtrend") {
    return null;
  }
  return <NumberField error={errors.topN?.message} label={t("topN")} register={register("topN")} />;
}

function NumberField({
  error,
  label,
  max,
  register,
  step = 1,
}: Readonly<{
  error?: string;
  label: string;
  max?: number;
  register: UseFormRegisterReturn;
  step?: number;
}>) {
  return (
    <label className={labelClass} htmlFor={`alert-${register.name}`}>
      {label}
      <Input
        id={`alert-${register.name}`}
        max={max}
        min={1}
        step={step}
        type="number"
        {...register}
      />
      {error ? <span className="text-red-text">{error}</span> : null}
    </label>
  );
}

function TextField({
  error,
  label,
  register,
}: Readonly<{
  error?: string;
  label: string;
  register: UseFormRegisterReturn;
}>) {
  return (
    <label className={labelClass} htmlFor={`alert-${register.name}`}>
      {label}
      <Input id={`alert-${register.name}`} {...register} />
      {error ? <span className="text-red-text">{error}</span> : null}
    </label>
  );
}
