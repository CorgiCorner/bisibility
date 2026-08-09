"use client";

import { Button, inputClassName, MenuMultiSelect, MenuSelect } from "@/components/ui";
import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import type { NewRuleForm, RuleTemplateId } from "@/lib/alerts/new-rule-data";
import { ruleSeverityMeta, ruleTemplates } from "@/lib/alerts/new-rule-data";
import type {
  FieldErrors,
  UseFormRegister,
  UseFormRegisterReturn,
  UseFormSetValue,
} from "react-hook-form";

const labelClass =
  "flex flex-col gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const fieldClass = `${inputClassName} rounded-[9px] px-3 py-2.5 text-[13px] font-medium`;
const selectTriggerClass =
  "min-h-10 w-full justify-between rounded-[9px] border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";
const scopeOptions = [
  { label: "All keywords", value: "all" },
  { label: "Keyword", value: "keyword" },
  { label: "Tag", value: "tag" },
] as const;
export const conditionOptions = [
  { label: "Position drop", value: "position_drop" },
  { label: "CTR drop (GSC)", value: "ctr_drop" },
  { label: "Sustained downtrend", value: "downtrend" },
  { label: "Exits top N", value: "exits_top_n" },
  { label: "Enters top N", value: "enters_top_n" },
  { label: "Crosses threshold", value: "threshold" },
  { label: "Percent change", value: "change_pct" },
  { label: "Competitor overtakes", value: "competitor_overtake" },
  { label: "SERP feature appears", value: "serp_feature" },
  { label: "Ranking URL mismatch", value: "url_mismatch" },
] as const;
export function TemplatePicker({
  selectedId,
  onSelect,
}: Readonly<{
  onSelect: (templateId: RuleTemplateId) => void;
  selectedId: RuleTemplateId;
}>) {
  return (
    <section>
      <div className="mb-[9px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        Template
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
              sx={
                active
                  ? {
                      backgroundColor: "var(--accent-soft)",
                      borderColor: "var(--accent)",
                      color: "var(--accent-text)",
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
              {item.label}
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
  const targetChoices = targetType === "tag" ? targets.tags : targets.keywords;
  const targetOptions = [
    { label: "Choose target", value: "" },
    ...targetChoices.map((target) => ({ label: target.label, value: target.id })),
  ];

  function updateTargetType(value: NewRuleForm["targetType"]) {
    setValue("targetType", value, { shouldDirty: true, shouldValidate: true });
    setValue("targetIds", [], { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <div className={targetType === "all" ? `${labelClass} sm:col-span-2` : labelClass}>
        <span>Scope</span>
        <input type="hidden" {...register("targetType")} />
        <MenuSelect
          ariaLabel="Scope"
          onChange={(value) => updateTargetType(value as NewRuleForm["targetType"])}
          options={scopeOptions}
          triggerClassName={selectTriggerClass}
          value={targetType}
        />
      </div>
      {targetType !== "all" ? (
        <div className={labelClass}>
          <span>Target</span>
          <MenuSelect
            ariaLabel="Target"
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
  return (
    <div className="mt-3 flex flex-col gap-[7px]">
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        Recipients
      </span>
      <MenuMultiSelect
        ariaLabel="Alert email recipients"
        minSelected={0}
        onChange={(values) =>
          setValue("recipientIds", values, { shouldDirty: true, shouldValidate: true })
        }
        options={targets.members.map((member) => ({ label: member.label, value: member.id }))}
        placeholder="Creator (default)"
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
  if (conditionType === "change_pct" || conditionType === "ctr_drop") {
    return (
      <NumberField
        error={errors.changePct?.message}
        label={conditionType === "ctr_drop" ? "CTR drop %" : "Change %"}
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
        label="Threshold position"
        register={register("thresholdPosition")}
      />
    );
  }
  if (conditionType === "position_drop") {
    return (
      <NumberField
        error={errors.dropPositions?.message}
        label="Drop positions"
        register={register("dropPositions")}
      />
    );
  }
  if (conditionType === "competitor_overtake") {
    return (
      <TextField
        error={errors.competitorDomain?.message}
        label="Competitor domain"
        register={register("competitorDomain")}
      />
    );
  }
  if (conditionType === "serp_feature") {
    return (
      <TextField
        error={errors.serpFeature?.message}
        label="SERP feature"
        register={register("serpFeature")}
      />
    );
  }
  if (conditionType === "url_mismatch" || conditionType === "downtrend") {
    return null;
  }
  return <NumberField error={errors.topN?.message} label="Top N" register={register("topN")} />;
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
