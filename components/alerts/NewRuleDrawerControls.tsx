"use client";

import { Button } from "@/components/ui/Button";
import { inputClassName } from "@/components/ui/input-styles";
import { MenuMultiSelect, MenuSelect } from "@/components/ui/MenuSelect";
import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import type { NewRuleForm, RuleTemplateId } from "@/lib/alerts/new-rule-data";
import { ruleSeverityMeta, ruleTemplates } from "@/lib/alerts/new-rule-data";
import { useTranslations } from "next-intl";
import type {
  FieldErrors,
  UseFormRegister,
  UseFormRegisterReturn,
  UseFormSetValue,
} from "react-hook-form";

const labelClass =
  "flex flex-col gap-[7px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const fieldClass = `${inputClassName} rounded-control px-3 py-2.5 text-[13px] font-medium`;
const selectTriggerClass =
  "min-h-10 w-full justify-between rounded-control border-border-control bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";
export function conditionOptions(t: ReturnType<typeof useTranslations<"projectAlerts.drawer">>) {
  return [
    { label: t("conditionPositionDrop"), value: "position_drop" },
    { label: t("conditionCtrDrop"), value: "ctr_drop" },
    { label: t("conditionDowntrend"), value: "downtrend" },
    { label: t("conditionExitsTopN"), value: "exits_top_n" },
    { label: t("conditionEntersTopN"), value: "enters_top_n" },
    { label: t("conditionThreshold"), value: "threshold" },
    { label: t("conditionChangePct"), value: "change_pct" },
    { label: t("conditionCompetitor"), value: "competitor_overtake" },
    { label: t("conditionSerpFeature"), value: "serp_feature" },
    { label: t("conditionUrlMismatch"), value: "url_mismatch" },
  ] as const;
}
export function TemplatePicker({
  selectedId,
  onSelect,
}: Readonly<{
  onSelect: (templateId: RuleTemplateId) => void;
  selectedId: RuleTemplateId;
}>) {
  const t = useTranslations("projectAlerts.drawer");

  return (
    <section>
      <div className="mb-[9px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("template")}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(ruleTemplates).map(([id, item]) => {
          const templateId = id as RuleTemplateId;
          const active = selectedId === templateId;

          return (
            <Button
              className="gap-2"
              disabled={item.disabled}
              key={id}
              onClick={() => onSelect(templateId)}
              size="sm"
              style={
                active
                  ? {
                      "--control-background-color": "var(--accent-soft)",
                      "--control-border-color": "var(--accent)",
                      "--control-color": "var(--accent-text)",
                    }
                  : undefined
              }
              type="button"
              variant="secondary"
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ backgroundColor: ruleSeverityMeta[item.severity].color }}
              />
              {t("templateLabel", { template: templateId })}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

export function ScopeFields({
  errors,
  register,
  setValue,
  targetId,
  targets,
  targetType,
}: Readonly<{
  errors: FieldErrors<NewRuleForm>;
  register: UseFormRegister<NewRuleForm>;
  setValue: UseFormSetValue<NewRuleForm>;
  targetId: string;
  targets: AlertTargetOptions;
  targetType: NewRuleForm["targetType"];
}>) {
  const t = useTranslations("projectAlerts.drawer");
  const scopeOptions = [
    { label: t("scopeAll"), value: "all" },
    { label: t("scopeKeyword"), value: "keyword" },
    { label: t("scopeTag"), value: "tag" },
  ] as const;
  const targetChoices = targetType === "tag" ? targets.tags : targets.keywords;
  const targetOptions = [
    { label: t("chooseTarget"), value: "" },
    ...targetChoices.map((target) => ({ label: target.label, value: target.id })),
  ];

  function updateTargetType(value: NewRuleForm["targetType"]) {
    setValue("targetType", value, { shouldDirty: true, shouldValidate: true });
    setValue("targetIds", [], { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <div className={targetType === "all" ? `${labelClass} sm:col-span-2` : labelClass}>
        <span>{t("scope")}</span>
        <input type="hidden" {...register("targetType")} />
        <MenuSelect
          ariaLabel={t("scope")}
          onChange={(value) => updateTargetType(value as NewRuleForm["targetType"])}
          options={scopeOptions}
          triggerClassName={selectTriggerClass}
          value={targetType}
        />
      </div>
      {targetType !== "all" ? (
        <div className={labelClass}>
          <span>{t("target")}</span>
          <MenuSelect
            ariaLabel={t("target")}
            onChange={(value) =>
              setValue("targetIds", value ? [value] : [], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            options={targetOptions}
            triggerClassName={selectTriggerClass}
            value={targetId}
          />
          {errors.targetIds ? (
            <span className="text-red-text">{errors.targetIds.message}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RecipientFields({
  recipientIds,
  setValue,
  targets,
}: Readonly<{
  recipientIds: string[];
  setValue: UseFormSetValue<NewRuleForm>;
  targets: AlertTargetOptions;
}>) {
  const t = useTranslations("projectAlerts.drawer");

  return (
    <div className="mt-3 flex flex-col gap-[7px]">
      <span className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("recipients")}
      </span>
      <MenuMultiSelect
        ariaLabel={t("recipientsAria")}
        minSelected={0}
        onChange={(values) =>
          setValue("recipientIds", values, { shouldDirty: true, shouldValidate: true })
        }
        options={targets.members.map((member) => ({ label: member.label, value: member.id }))}
        placeholder={t("creatorDefault")}
        searchable
        triggerClassName={selectTriggerClass}
        values={recipientIds}
      />
    </div>
  );
}

export function ConditionFields({
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
    <label className={labelClass}>
      {label}
      <input className={fieldClass} max={max} min={1} step={step} type="number" {...register} />
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
    <label className={labelClass}>
      {label}
      <input className={fieldClass} {...register} />
      {error ? <span className="text-red-text">{error}</span> : null}
    </label>
  );
}
