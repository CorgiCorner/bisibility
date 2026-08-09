"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, FieldLabel, MenuSelect } from "@/components/ui";
import { updateRankCheckFrequency } from "@/lib/actions/settings";
import { frequencyDeltaCents, monthlyCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_MARKET,
  normalizeSerpMarketName,
  resolveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/markets";
import { FIELD_HELP } from "@/lib/settings/field-help";
import {
  type DefaultsData,
  frequencyOptions,
  getRankSchedulePreview,
} from "@/lib/settings/options";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import {
  CheckCircleIcon as CheckCircle,
  ClockCountdownIcon as ClockCountdown,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { type UseFormReturn, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { ManualCheckPanel } from "./ManualCheckPanel";
import { ScheduleMetrics } from "./ScheduleMetrics";

type DefaultsForm = z.infer<typeof projectDefaultsSchema>;
const timezoneTriggerClass =
  "min-h-10 w-full justify-between rounded-lg border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal";
const fieldLabelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export type RankCheckFrequencyProps = {
  defaults: DefaultsData;
  className?: string;
  form?: UseFormReturn<DefaultsForm>;
  projectId?: string;
  referenceIso?: string;
  updateFrequency?: (input: DefaultsForm) => Promise<unknown>;
};

function defaultValues(defaults: DefaultsData, projectId = "story_project"): DefaultsForm {
  const frequency = defaults.schedule.frequency;

  return {
    country: normalizeSerpMarketName(defaults.country) ?? DEFAULT_SERP_MARKET,
    cronExpression: defaults.schedule.cron_expression ?? "0 6 * * *",
    device: defaults.device.toLowerCase() === "mobile" ? "mobile" : "desktop",
    frequency,
    jitterMinutes: defaults.schedule.jitter_minutes,
    projectId,
    serpDepth:
      (defaults as DefaultsData & { serpDepth?: SerpDepth }).serpDepth ?? DEFAULT_SERP_DEPTH,
    serpStopOnMatch: resolveSerpStopOnMatch(defaults.serpStopOnMatch),
    timezone: defaults.schedule.timezone,
  };
}

export function RankCheckFrequency({
  defaults,
  className,
  form,
  projectId,
  referenceIso = "2026-06-19T00:00:00.000Z",
  updateFrequency,
}: Readonly<RankCheckFrequencyProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const localForm = useForm<DefaultsForm>({
    resolver: zodResolver(projectDefaultsSchema),
    defaultValues: defaultValues(defaults, projectId),
    mode: "onChange",
  });
  const { readOnly } = useProjectWriteMode();
  const activeForm = form ?? localForm;
  const { control, formState, register, setValue } = activeForm;
  const values = useWatch({ control });
  const frequency = values.frequency ?? defaults.schedule.frequency;
  const timezone = values.timezone ?? defaults.schedule.timezone;
  const jitterMinutes = values.jitterMinutes ?? defaults.schedule.jitter_minutes;
  const cronExpression = values.cronExpression ?? defaults.schedule.cron_expression ?? "0 6 * * *";
  const cronInputId = useId();
  const menuOptions = timezoneSelectOptions(timezone);
  const preview = getRankSchedulePreview({
    cronExpression,
    defaults,
    frequency,
    referenceIso,
    timezone,
  });
  const estimateVolume = {
    depth: defaults.serpDepth,
    deviceCount: defaults.deviceCount,
    keywordCount: defaults.keywordCount,
    locationCount: defaults.locationCount,
  };
  const rate = { overrideCents: defaults.costPerCheck * 100, providerId: null };
  const deltaCronExpression =
    frequency === "custom_cron" ? cronExpression : defaults.schedule.cron_expression;
  let deltaCents = frequencyDeltaCents(
    { ...estimateVolume, cronExpression: deltaCronExpression },
    defaults.schedule.frequency,
    frequency,
    rate,
  );
  if (defaults.schedule.frequency === "custom_cron" && frequency === "custom_cron") {
    const previousCost = monthlyCostCentsFor(
      {
        ...estimateVolume,
        cronExpression: defaults.schedule.cron_expression,
        frequency: "custom_cron",
      },
      rate,
    );
    const nextCost = monthlyCostCentsFor(
      { ...estimateVolume, cronExpression, frequency: "custom_cron" },
      rate,
    );
    deltaCents = previousCost == null || nextCost == null ? null : nextCost - previousCost;
  }

  function setFrequency(value: DefaultsForm["frequency"]) {
    setValue("frequency", value, { shouldDirty: true, shouldValidate: true });
    if (value === "custom_cron" && !cronExpression) {
      setValue("cronExpression", "0 6 * * *", { shouldDirty: true, shouldValidate: true });
    }
  }

  function setTimezone(value: string) {
    setValue("timezone", value, { shouldDirty: true, shouldValidate: true });
  }

  function saveLocalFrequency() {
    if (form || !projectId || readOnly) {
      return;
    }

    setMessage(null);
    const values = { ...activeForm.getValues(), projectId };
    startTransition(() => {
      void (updateFrequency ?? updateRankCheckFrequency)(values)
        .then(() => {
          activeForm.reset(values);
          setMessage("Rank check frequency saved.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Frequency could not be saved.")),
        );
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-1.5">
        <FieldLabel
          className={fieldLabelClass}
          help={FIELD_HELP.frequency}
          label="Rank check frequency"
        />
        <ProjectReadOnlyTooltip className="inline-flex flex-wrap gap-2">
          {frequencyOptions.map((option) => (
            <button
              aria-pressed={frequency === option.value}
              className={cn(
                "min-h-10 rounded-lg border px-[11px] text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted",
                frequency === option.value
                  ? "border-accent bg-accent-solid text-primary-contrast"
                  : "border-border-strong bg-transparent text-fg-muted hover:border-accent hover:text-accent-text",
              )}
              disabled={readOnly}
              key={option.value}
              onClick={() => setFrequency(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </ProjectReadOnlyTooltip>
        <input type="hidden" {...register("frequency")} />
        <input type="hidden" {...register("jitterMinutes", { valueAsNumber: true })} />
      </div>

      {!form && projectId ? (
        <div className="flex items-center gap-3">
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly || !formState.isDirty}
              loading={isPending}
              loadingLabel="Saving"
              onClick={saveLocalFrequency}
              size="sm"
              type="button"
            >
              Save frequency
            </Button>
          </ProjectReadOnlyTooltip>
          {message ? (
            <span className="text-[11.5px] font-medium text-fg-muted">{message}</span>
          ) : null}
        </div>
      ) : null}

      {frequency === "manual" ? <ManualCheckPanel projectId={projectId} /> : null}

      {frequency === "custom_cron" ? (
        <div className="rounded-[14px] border border-border bg-bg-elev p-4">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold">
            <ClockCountdown className="text-accent-text" size={16} weight="fill" />
            Custom schedule
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={cn("flex flex-col gap-1.5", fieldLabelClass)}>
              <FieldLabel help={FIELD_HELP.cron} htmlFor={cronInputId} label="Cron expression" />
              <input
                className="min-h-10 rounded-lg border border-border-strong bg-transparent px-3 font-mono text-[13px] text-fg outline-none focus:border-accent"
                id={cronInputId}
                {...register("cronExpression")}
              />
              <span className="normal-case tracking-normal">
                minute hour day-of-month month day-of-week
              </span>
            </div>
            <div className={cn("flex flex-col gap-1.5", fieldLabelClass)}>
              <FieldLabel help={FIELD_HELP.timezone} label="Timezone" />
              <input type="hidden" {...register("timezone")} />
              <MenuSelect
                ariaLabel="Timezone"
                onChange={setTimezone}
                options={menuOptions}
                searchable
                searchPlaceholder="Search time zones..."
                triggerClassName={timezoneTriggerClass}
                value={timezone}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12.5px] text-fg">
            <CheckCircle
              aria-hidden
              className={preview.parsedCron.ok ? "text-green-text" : "text-yellow-text"}
              size={15}
            />
            {formState.errors.cronExpression?.message ?? preview.humanPreview}
          </div>
        </div>
      ) : null}
      <ScheduleMetrics
        checksPerRun={preview.checksPerRun}
        deltaCents={formState.isDirty ? deltaCents : undefined}
        jitterMinutes={jitterMinutes}
        monthlyChecks={preview.monthlyChecks}
        monthlyCost={preview.monthlyCost}
        runs={preview.nextRunLabels}
        timing={preview.timing}
      />
    </div>
  );
}
