"use client";

import { Button, FieldLabel, MenuSelect, useToast } from "@/components/ui";
import {
  type CostRateInfo,
  formatEstimateCents,
  monthlyCostCentsFor,
} from "@/lib/cost-estimate/project-estimate";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import {
  JITTER_MINUTES_MAX,
  type KeywordScheduleUpdateInput,
  keywordScheduleUpdateSchema,
} from "@/lib/schemas/keyword";
import { serpDepthDecreaseWarning } from "@/lib/schemas/serp-depth";
import { DEFAULT_SERP_DEPTH, type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { frequencyOptions } from "@/lib/settings/options";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { actionErrorMessage, actionWarningMessage, type KeywordAction } from "./action-utils";

type KeywordScheduleInlineFormProps = {
  formId?: string;
  hideSubmit?: boolean;
  keyword: KeywordRow;
  layout?: "drawer" | "inline";
  onSaved?: () => void;
  onSavingChange?: (saving: boolean) => void;
  projectDepth?: SerpDepth;
  providerRate?: CostRateInfo;
  scheduleDepth?: SerpDepth | null;
  updateKeywordScheduleAction: KeywordAction<KeywordScheduleUpdateInput>;
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";
const inputClass =
  "min-h-10 rounded-lg border border-border-strong bg-bg-sunken px-3 font-sans text-[13px] font-medium normal-case tracking-normal text-fg outline-none";
const triggerClass =
  "min-h-10 w-full justify-between rounded-lg border-border-strong bg-bg-sunken px-3 text-[13px] font-medium normal-case tracking-normal";
const depthOptions = (projectDepth: SerpDepth) => [
  { label: `Inherit (Top ${projectDepth})`, value: "inherit" },
  ...serpDepthValues.map((depth) => ({
    label: `Top ${depth}`,
    value: String(depth),
  })),
];

function defaultValues(
  keyword: KeywordRow,
  scheduleDepth: SerpDepth | null,
): KeywordScheduleUpdateInput {
  const schedule = keyword.schedule;
  return {
    cronExpression:
      schedule.cron_expression ?? (schedule.frequency === "custom_cron" ? "0 6 * * *" : null),
    frequency: schedule.frequency,
    jitterMinutes: schedule.jitter_minutes,
    keywordId: keyword.id,
    serpDepth: scheduleDepth,
    timezone: schedule.timezone,
  };
}

export function KeywordScheduleInlineForm({
  formId,
  hideSubmit = false,
  keyword,
  layout = "inline",
  onSaved,
  onSavingChange,
  projectDepth = DEFAULT_SERP_DEPTH,
  providerRate,
  scheduleDepth = null,
  updateKeywordScheduleAction,
}: Readonly<KeywordScheduleInlineFormProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<KeywordScheduleUpdateInput>({
    defaultValues: defaultValues(keyword, scheduleDepth),
    resolver: zodResolver(keywordScheduleUpdateSchema),
  });
  const cronExpression = watch("cronExpression");
  const frequency = watch("frequency");
  const serpDepth = watch("serpDepth") ?? null;
  const timezone = watch("timezone");
  const scheduleSource = keyword.scheduleSource ?? "keyword";
  const depthWarning = serpDepth !== null && serpDepth < projectDepth;
  const projectedCostCents = providerRate
    ? monthlyCostCentsFor(
        {
          cronExpression,
          depth: serpDepth ?? projectDepth,
          deviceCount: 1,
          frequency,
          keywordCount: 1,
          locationCount: 1,
        },
        providerRate,
      )
    : null;
  const showStatus = scheduleSource === "project" || Boolean(message) || depthWarning;

  function setFrequency(value: string) {
    const next = value as KeywordScheduleUpdateInput["frequency"];
    setValue("frequency", next, { shouldDirty: true, shouldValidate: true });
    if (next === "custom_cron" && !watch("cronExpression")) {
      setValue("cronExpression", "0 6 * * *", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  function setTimezone(value: string) {
    setValue("timezone", value, { shouldDirty: true, shouldValidate: true });
  }

  function setSerpDepth(value: string) {
    setValue("serpDepth", value === "inherit" ? null : (Number(value) as SerpDepth), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function save(values: KeywordScheduleUpdateInput) {
    setMessage(null);
    onSavingChange?.(true);
    try {
      const result = await updateKeywordScheduleAction(values);
      const warning = actionWarningMessage(result);
      setMessage(warning);
      if (!warning) showToast("Schedule saved.", { tint: "green" });
      router.refresh();
      if (!warning) onSaved?.();
    } catch (error) {
      setMessage(actionErrorMessage(error));
    } finally {
      onSavingChange?.(false);
    }
  }

  return (
    <form
      className={
        layout === "drawer"
          ? "grid gap-4"
          : `mt-[18px] grid gap-3 border-t border-border pt-[18px] md:grid-cols-2 ${
              frequency === "custom_cron"
                ? "xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]"
                : "xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
            }`
      }
      id={formId}
      onSubmit={handleSubmit((values) => void save(values))}
    >
      <input type="hidden" {...register("keywordId")} />
      <div className={labelClass}>
        <FieldLabel help={FIELD_HELP.frequency} label="Frequency" />
        <input type="hidden" {...register("frequency")} />
        <MenuSelect
          ariaLabel="Frequency"
          onChange={setFrequency}
          options={frequencyOptions}
          triggerClassName={triggerClass}
          value={frequency}
        />
      </div>
      {frequency === "custom_cron" ? (
        <div className={labelClass}>
          <FieldLabel help={FIELD_HELP.cron} label="Cron" />
          <input
            aria-label="Cron"
            className={inputClass}
            placeholder="0 6 * * *"
            {...register("cronExpression")}
          />
          {errors.cronExpression ? (
            <span className="text-red">{errors.cronExpression.message}</span>
          ) : null}
        </div>
      ) : null}
      <label className={labelClass}>
        {"SERP depth "}
        <input type="hidden" {...register("serpDepth")} />
        <MenuSelect
          ariaLabel="SERP depth"
          onChange={setSerpDepth}
          options={depthOptions(projectDepth)}
          triggerClassName={triggerClass}
          value={serpDepth == null ? "inherit" : String(serpDepth)}
        />
      </label>
      <div className={labelClass}>
        <FieldLabel help={FIELD_HELP.timezone} label="Timezone" />
        <input type="hidden" {...register("timezone")} />
        <MenuSelect
          ariaLabel="Timezone"
          onChange={setTimezone}
          options={timezoneSelectOptions(timezone)}
          searchable
          searchPlaceholder="Search time zones..."
          triggerClassName={triggerClass}
          value={timezone}
        />
      </div>
      <div className={labelClass}>
        <FieldLabel help={FIELD_HELP.jitter} label="Jitter (min)" />
        <input
          aria-label="Jitter (min)"
          className={inputClass}
          max={JITTER_MINUTES_MAX}
          min={0}
          type="number"
          {...register("jitterMinutes")}
        />
        {errors.jitterMinutes ? (
          <span className="text-red">{errors.jitterMinutes.message}</span>
        ) : null}
      </div>
      {providerRate ? (
        <div className={labelClass}>
          <span>Estimated provider cost</span>
          <span className="flex min-h-10 items-center rounded-lg bg-bg-sunken px-3 font-mono text-[12px] text-fg">
            {projectedCostCents == null
              ? "Unavailable"
              : `~ ${formatEstimateCents(projectedCostCents)}/month`}
          </span>
        </div>
      ) : null}
      {!hideSubmit ? (
        <Button
          className="w-full self-end whitespace-nowrap xl:w-auto"
          disabled={isSubmitting}
          size="sm"
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Save schedule"}
        </Button>
      ) : null}
      {showStatus ? (
        <div className={layout === "inline" ? "md:col-span-2 xl:col-span-full" : undefined}>
          {scheduleSource === "project" ? (
            <span className="font-mono text-[11px] text-fg-faint">Inherits project default</span>
          ) : null}
          {message ? (
            <span className="ml-3 font-mono text-[11px] text-fg-muted">{message}</span>
          ) : null}
          {depthWarning && serpDepth !== null ? (
            <span className="ml-3 font-mono text-[11px] text-yellow">
              {serpDepthDecreaseWarning(serpDepth)}
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
