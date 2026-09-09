"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import {
  type CostRateInfo,
  formatEstimateCents,
  frequencyDeltaCents,
} from "@/lib/cost-estimate/project-estimate";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { newScheduleDefaults } from "@/lib/schedules/form-defaults";
import type { RankCheckFrequency } from "@/lib/settings/options";
import Link from "next/link";
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
  type ScheduleLoadState,
} from "./set-schedule-model";

type SetScheduleModalProps = {
  currentScheduleId?: string | null;
  initialChoice?: ScheduleChoice;
  initialView?: ModalView;
  onClose: () => void;
  onDone: () => void;
  open: boolean;
  projectId: string;
  providerRate?: CostRateInfo;
  scheduleLoadError?: string | null;
  scheduleLoadState?: ScheduleLoadState;
  schedules: readonly CheckScheduleSummary[];
  selectedRows: readonly KeywordRow[];
};

const formId = "set-keyword-schedule";
function targetLabel(count: number) {
  return `${count} target${count === 1 ? "" : "s"}`;
}

function keywordLabel(count: number) {
  return `${count} keyword${count === 1 ? "" : "s"}`;
}

function scheduleFrequency(schedule: CheckScheduleSummary): RankCheckFrequency {
  return schedule.enabled ? schedule.frequency : "paused";
}

function matchesSchedule(row: KeywordRow, schedule: CheckScheduleSummary) {
  return row.checkSchedule?.publicId === schedule.publicId;
}

async function requestApi<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = (await response.json()) as { data?: T; detail?: string };
  if (!response.ok || body.data === undefined) {
    throw new Error(body.detail || "Could not update the schedule. Try again.");
  }
  return body.data;
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
      timezone: newScheduleDefaults.timezone ?? "",
    },
    resolver: zodResolver(newScheduleSchema),
  });
  const choice = form.watch("choice");
  const schedulesLoading = scheduleLoadState === "loading";
  const title =
    view === "new"
      ? "New schedule from selection"
      : `Set schedule for ${keywordLabel(selectedCount)} / ${targetLabel(selectedCount)}`;
  const cta = view === "new" ? "Create schedule" : choice === "remove" ? "Remove" : "Apply";
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
      return "No scheduled spend";
    if (!providerRate) return "Estimate unavailable";
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
    if (delta == null) return "Estimate unavailable";
    return delta === 0
      ? "Same monthly spend"
      : `${delta > 0 ? "+" : ""}${formatEstimateCents(delta)} / month`;
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
        if (!currentScheduleId)
          throw new Error("The current schedule is unavailable. Refresh and try again.");
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
      showToast(view === "new" ? "Schedule created" : "Schedule updated", { severity: "success" });
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update the schedule. Try again.",
      );
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
              Back
            </Button>
          ) : (
            <Link
              className="mr-auto text-[11.5px] font-semibold text-fg-muted hover:text-fg"
              href={projectSchedulesPath(projectId)}
            >
              Manage schedules
            </Link>
          )}
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            className="shrink-0 whitespace-nowrap"
            disabled={disabled}
            form={formId}
            loading={form.formState.isSubmitting}
            loadingLabel="Saving..."
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
