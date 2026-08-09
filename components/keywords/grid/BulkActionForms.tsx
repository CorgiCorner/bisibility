"use client";

import {
  actionErrorMessage,
  actionResultCount,
  type KeywordAction,
  keywordCountLabel,
  splitTagInput,
} from "@/components/keywords/action-utils";
import { Button, FieldLabel, inputClassName, MenuSelect, useToast } from "@/components/ui";
import {
  type CostRateInfo,
  formatEstimateCents,
  frequencyDeltaCents,
  monthlyCostCentsFor,
} from "@/lib/cost-estimate/project-estimate";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import {
  type BulkKeywordFrequencyInput,
  type BulkKeywordTagInput,
  bulkKeywordFrequencySchema,
  bulkKeywordTagSchema,
  JITTER_MINUTES_MAX,
} from "@/lib/schemas/keyword";
import { FIELD_HELP } from "@/lib/settings/field-help";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { effectiveRowDepth } from "./run-check-depth";

type BulkFormProps<TInput> = {
  action: KeywordAction<TInput>;
  onDone: () => void;
  onError: (message: string | null) => void;
  projectId: string;
  selectedIds: string[];
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const inputClass = `${inputClassName} min-h-10 rounded-lg px-3 font-sans text-[13px] normal-case tracking-normal`;
const frequencyOptions = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Manual", value: "manual" },
  { label: "Paused", value: "paused" },
  { label: "Custom cron", value: "custom_cron" },
] as const;
const frequencyTriggerClass =
  "min-h-10 w-full justify-between rounded-lg border-border-strong bg-transparent px-3 font-sans text-[13px] font-normal normal-case tracking-normal";

const noopUndo = () => undefined;

function bulkToastOptions() {
  return { tint: "green" as const, undo: noopUndo };
}

export function BulkTagForm({
  action,
  onDone,
  onError,
  projectId,
  selectedIds,
}: Readonly<BulkFormProps<BulkKeywordTagInput>>) {
  const { showToast } = useToast();
  const [tagsText, setTagsText] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    setValue,
  } = useForm<BulkKeywordTagInput>({
    defaultValues: { keywordIds: selectedIds, projectId, tags: [] },
    resolver: zodResolver(bulkKeywordTagSchema),
  });
  const tagMessage = Array.isArray(errors.tags) ? errors.tags[0]?.message : errors.tags?.message;

  async function save(values: BulkKeywordTagInput) {
    onError(null);
    try {
      const result = await action(values);
      const count = actionResultCount(result, selectedIds.length);
      showToast(`Tagged ${keywordCountLabel(count)}`, bulkToastOptions());
      onDone();
    } catch (error) {
      onError(actionErrorMessage(error));
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit((v) => void save(v))}>
      <label className={labelClass}>
        {"Tags "}
        <input
          className={inputClass}
          onChange={(event) => {
            setTagsText(event.target.value);
            setValue("tags", splitTagInput(event.target.value), {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          placeholder="Product, High intent"
          value={tagsText}
        />
        {tagMessage ? <span className="text-red-text">{tagMessage}</span> : null}
      </label>
      <Button disabled={isSubmitting} size="sm" sx={{ minHeight: 40 }} type="submit">
        {isSubmitting ? "Adding..." : "Apply tag"}
      </Button>
    </form>
  );
}

export function BulkFrequencyForm({
  action,
  onDone,
  onError,
  projectId,
  providerRate,
  selectedRows,
}: Readonly<
  Omit<BulkFormProps<BulkKeywordFrequencyInput>, "selectedIds"> & {
    providerRate?: CostRateInfo;
    selectedRows: KeywordRow[];
  }
>) {
  const selectedIds = selectedRows.map((row) => row.id);
  const { showToast } = useToast();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<BulkKeywordFrequencyInput>({
    defaultValues: {
      keywordIds: selectedIds,
      projectId,
      schedule: {
        cronExpression: null,
        frequency: "daily",
        jitterMinutes: 60,
        timezone: "UTC",
      },
    },
    resolver: zodResolver(bulkKeywordFrequencySchema),
  });
  const frequency = watch("schedule.frequency");
  const cronExpression = watch("schedule.cronExpression");
  const timezone = watch("schedule.timezone");
  const deltas = providerRate
    ? selectedRows.map((row) => {
        const volume = {
          cronExpression:
            frequency === "custom_cron" ? cronExpression : row.schedule.cron_expression,
          depth: effectiveRowDepth(row),
          deviceCount: 1,
          keywordCount: 1,
          locationCount: 1,
        };
        if (row.schedule.frequency !== "custom_cron" || frequency !== "custom_cron") {
          return frequencyDeltaCents(volume, row.schedule.frequency, frequency, providerRate);
        }
        const previousCost = monthlyCostCentsFor(
          {
            ...volume,
            cronExpression: row.schedule.cron_expression,
            frequency: "custom_cron",
          },
          providerRate,
        );
        const nextCost = monthlyCostCentsFor({ ...volume, frequency: "custom_cron" }, providerRate);
        return previousCost == null || nextCost == null ? null : nextCost - previousCost;
      })
    : [];
  const totalDelta =
    deltas.length === selectedRows.length && deltas.every((value) => value != null)
      ? deltas.reduce((total, value) => total + (value ?? 0), 0)
      : null;
  const formattedDelta =
    totalDelta == null ? null : `${totalDelta > 0 ? "+" : ""}${formatEstimateCents(totalDelta)}`;

  async function save(values: BulkKeywordFrequencyInput) {
    onError(null);
    try {
      const result = await action(values);
      const count = actionResultCount(result, selectedIds.length);
      showToast(`Frequency set for ${keywordCountLabel(count)}`, bulkToastOptions());
      onDone();
    } catch (error) {
      onError(actionErrorMessage(error));
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit((v) => void save(v))}>
      <div className={labelClass}>
        <FieldLabel help={FIELD_HELP.frequency} label="Frequency" />
        <input type="hidden" {...register("schedule.frequency")} />
        <MenuSelect
          ariaLabel="Frequency"
          onChange={(value) =>
            setValue(
              "schedule.frequency",
              value as BulkKeywordFrequencyInput["schedule"]["frequency"],
              {
                shouldDirty: true,
                shouldValidate: true,
              },
            )
          }
          options={frequencyOptions}
          triggerClassName={frequencyTriggerClass}
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
            {...register("schedule.cronExpression")}
          />
          {errors.schedule?.cronExpression ? (
            <span className="text-red-text">{errors.schedule.cronExpression.message}</span>
          ) : null}
        </div>
      ) : null}
      <div className={labelClass}>
        <FieldLabel help={FIELD_HELP.timezone} label="Timezone" />
        <input type="hidden" {...register("schedule.timezone")} />
        <MenuSelect
          ariaLabel="Timezone"
          onChange={(value) =>
            setValue("schedule.timezone", value, { shouldDirty: true, shouldValidate: true })
          }
          options={timezoneSelectOptions(timezone)}
          searchable
          searchPlaceholder="Search time zones..."
          triggerClassName={frequencyTriggerClass}
          value={timezone}
        />
        {errors.schedule?.timezone ? (
          <span className="text-red-text">{errors.schedule.timezone.message}</span>
        ) : null}
      </div>
      <div className={labelClass}>
        <FieldLabel help={FIELD_HELP.jitter} label="Jitter (min)" />
        <input
          aria-label="Jitter (min)"
          className={inputClass}
          max={JITTER_MINUTES_MAX}
          min={0}
          type="number"
          {...register("schedule.jitterMinutes")}
        />
      </div>
      <Button disabled={isSubmitting} size="sm" sx={{ minHeight: 40 }} type="submit">
        {isSubmitting ? "Saving..." : "Set frequency"}
      </Button>
      <p className="m-0 basis-full font-mono text-[11.5px] text-fg-muted">
        {formattedDelta == null
          ? `Estimate unavailable for ${selectedRows.length} selected keyword${selectedRows.length === 1 ? "" : "s"}.`
          : `~ ${formattedDelta}/mo for ${selectedRows.length} keyword${selectedRows.length === 1 ? "" : "s"}`}
      </p>
    </form>
  );
}
