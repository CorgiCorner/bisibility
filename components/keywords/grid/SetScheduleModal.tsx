"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { useScheduleNameLabels } from "@/components/schedules/useScheduleNameLabels";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { type CostRateInfo, frequencyDeltaCents } from "@/lib/cost-estimate/project-estimate";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { newScheduleDefaults } from "@/lib/schedules/form-defaults";
import { suggestedScheduleName } from "@/lib/schedules/suggested-name";
import type { RankCheckFrequency } from "@/lib/settings/options";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { NewScheduleFromSelection } from "./NewScheduleFromSelection";
import { effectiveRowDepth } from "./run-check-depth";
import { SetScheduleModalChoices } from "./SetScheduleModalChoices";
import {
  type CheckScheduleSummary,
  type ModalView,
  type NewScheduleValues,
  newScheduleRequest,
  newScheduleSchema,
  type ScheduleChoice,
  type ScheduleLoadProblem,
  type ScheduleLoadState,
} from "./set-schedule-model";
import {
  CurrentScheduleUnavailableError,
  requestApi,
  scheduleSaveError,
} from "./set-schedule-request";

type SetScheduleModalProps = {
  currentScheduleId?: string | null;
  initialChoice?: ScheduleChoice;
  initialView?: ModalView;
  onClose: () => void;
  onDone: () => void;
  open: boolean;
  projectId: string;
  providerRate?: CostRateInfo;
  scheduleLoadError?: ScheduleLoadProblem | null;
  scheduleLoadState?: ScheduleLoadState;
  schedules: readonly CheckScheduleSummary[];
  selectedRows: readonly KeywordRow[];
};

const formId = "set-keyword-schedule";

function scheduleFrequency(schedule: CheckScheduleSummary): RankCheckFrequency {
  return schedule.enabled ? schedule.frequency : "paused";
}

function matchesSchedule(row: KeywordRow, schedule: CheckScheduleSummary) {
  return row.checkSchedule?.publicId === schedule.publicId;
}

export function SetScheduleModal({
  currentScheduleId: suppliedCurrentScheduleId,
  initialChoice,
  initialView = "choose",
  onClose,
  onDone,
  open,
  projectId,
  providerRate,
  scheduleLoadError,
  scheduleLoadState = "loaded",
  schedules,
  selectedRows,
}: Readonly<SetScheduleModalProps>) {
  const { showToast } = useToast();
  const t = useTranslations("projectRankTracker.keywordImport.management.schedule");
  const scheduleNames = useScheduleNameLabels();
  const sharedErrors = useSharedErrorMessages();
  const [view, setView] = useState<ModalView>(initialView);
  const [error, setError] = useState<string | null>(null);
  const inferredCurrent = schedules.find(
    (schedule) =>
      selectedRows.length > 0 && selectedRows.every((row) => matchesSchedule(row, schedule)),
  );
  const currentScheduleId =
    suppliedCurrentScheduleId === undefined
      ? (inferredCurrent?.publicId ?? null)
      : suppliedCurrentScheduleId;
  const currentSchedule =
    schedules.find((schedule) => schedule.publicId === currentScheduleId) ?? null;
  const selectedCount = selectedRows.length;
  const form = useForm<NewScheduleValues>({
    defaultValues: {
      ...newScheduleDefaults,
      choice: initialChoice ?? currentScheduleId,
      cronExpression: "0 6 * * *",
      day: "Monday",
      dayOfMonth: "1st",
      mode: initialView,
      name: suggestedScheduleName(
        {
          cronExpression: "0 6 * * *",
          dayOfMonth: "1st",
          frequency: newScheduleDefaults.frequency,
          timeOfDay: newScheduleDefaults.timeOfDay,
          weekday: "Monday",
        },
        scheduleNames,
      ),
      timezone: newScheduleDefaults.timezone ?? "",
    },
    resolver: zodResolver(newScheduleSchema),
  });
  const choice = form.watch("choice");
  const schedulesLoading = scheduleLoadState === "loading";
  const title = view === "new" ? t("newTitle") : t("title", { count: selectedCount });
  const cta = view === "new" ? t("create") : choice === "remove" ? t("remove") : t("apply");
  const disabled =
    schedulesLoading ||
    form.formState.isSubmitting ||
    (view === "choose" &&
      (!choice || choice === currentScheduleId || (choice === "remove" && !currentScheduleId)));

  function choose(nextChoice: ScheduleChoice) {
    setError(null);
    form.setValue("choice", nextChoice, { shouldDirty: true, shouldValidate: true });
  }

  function openNewSchedule() {
    setError(null);
    setView("new");
    form.setValue("mode", "new");
  }

  function backToChoices() {
    setError(null);
    setView("choose");
    form.reset({ ...form.formState.defaultValues, choice, mode: "choose" });
  }

  function monthlyDelta(schedule: CheckScheduleSummary | null) {
    if (!schedule && !currentScheduleId && !selectedRows.some((row) => row.checkSchedule))
      return t("monthlyNoSpend");
    if (!providerRate) return t("monthlyUnavailable");
    const destinationFrequency = schedule ? scheduleFrequency(schedule) : "manual";
    const delta = selectedRows
      .map((row) =>
        frequencyDeltaCents(
          {
            cronExpression:
              destinationFrequency === "custom_cron"
                ? (schedule?.cronExpression ?? null)
                : row.schedule.cron_expression,
            depth: effectiveRowDepth(row),
            deviceCount: 1,
            keywordCount: 1,
            locationCount: 1,
          },
          row.schedule.frequency,
          destinationFrequency,
          providerRate,
        ),
      )
      .reduce<number | null>(
        (total, value) => (total == null || value == null ? null : total + value),
        0,
      );
    if (delta == null) return t("monthlyUnavailable");
    if (delta === 0) return t("monthlySame");
    if (Math.abs(delta) < 1) {
      return t("monthlyDeltaBelowCent", {
        direction: delta > 0 ? "positive" : "negative",
        minimum: 0.01,
      });
    }
    return t("monthlyDelta", {
      cost: Math.abs(delta) / 100,
      direction: delta > 0 ? "positive" : "negative",
    });
  }

  async function save(values: NewScheduleValues) {
    setError(null);
    try {
      let scheduleId = values.choice;
      if (values.mode === "new") {
        const created = await requestApi<{ publicId: string }>("/api/check-schedules", {
          body: JSON.stringify(newScheduleRequest(values, projectId)),
          method: "POST",
        });
        scheduleId = created.publicId;
      }
      const membership = { keywordIds: selectedRows.map((row) => row.id), projectId };
      if (scheduleId === "remove") {
        if (!currentScheduleId) throw new CurrentScheduleUnavailableError();
        await requestApi(`/api/check-schedules/${currentScheduleId}/keywords`, {
          body: JSON.stringify(membership),
          method: "DELETE",
        });
      } else if (scheduleId) {
        await requestApi(`/api/check-schedules/${scheduleId}/keywords`, {
          body: JSON.stringify(membership),
          method: "POST",
        });
      }
      showToast(view === "new" ? t("created") : t("updated"), { severity: "success" });
      onDone();
    } catch (cause) {
      setError(scheduleSaveError(cause, sharedErrors, t));
    }
  }

  return (
    <Modal
      footer={
        <>
          {view === "new" ? (
            <Button
              className="mr-auto"
              disabled={form.formState.isSubmitting}
              onClick={backToChoices}
              type="button"
              variant="ghost"
            >
              {t("back")}
            </Button>
          ) : (
            <Link
              className="mr-auto text-[11.5px] font-semibold text-fg-muted hover:text-fg"
              href={projectSchedulesPath(projectId)}
            >
              {t("manage")}
            </Link>
          )}
          <Button onClick={onClose} type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            className="shrink-0 whitespace-nowrap"
            disabled={disabled}
            form={formId}
            loading={form.formState.isSubmitting}
            loadingLabel={t("saving")}
            type="submit"
          >
            {cta}
          </Button>
        </>
      }
      headerDivider
      onClose={onClose}
      open={open}
      primaryActionDisabled={disabled}
      size="sm"
      title={title}
    >
      <form
        className="grid gap-3"
        id={formId}
        onSubmit={form.handleSubmit((values) => void save(values))}
      >
        {view === "choose" ? (
          <SetScheduleModalChoices
            choice={choice}
            currentSchedule={currentSchedule}
            currentScheduleId={currentScheduleId}
            hasScheduledTargets={
              Boolean(currentScheduleId) || selectedRows.some((row) => Boolean(row.checkSchedule))
            }
            loadError={scheduleLoadError}
            loading={schedulesLoading}
            monthlyDelta={monthlyDelta}
            onChoose={choose}
            onOpenNewSchedule={openNewSchedule}
            schedules={schedules}
            selectedCount={selectedCount}
          />
        ) : (
          <NewScheduleFromSelection
            errors={form.formState.errors}
            projectDepth={selectedRows[0]?.projectSerpDepth}
            projectTimezone={selectedRows[0]?.projectTimezone}
            register={form.register}
            selectedCount={selectedCount}
            setValue={form.setValue}
            watch={form.watch}
          />
        )}
        {error ? <p className="m-0 text-[11.5px] text-red-text">{error}</p> : null}
      </form>
    </Modal>
  );
}
