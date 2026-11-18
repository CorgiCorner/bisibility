"use client";

import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { useScheduleNameLabels } from "@/components/schedules/useScheduleNameLabels";
import {
  ScheduleReviewCancelled,
  useScheduleSpendReview,
} from "@/components/schedules/useScheduleSpendReview";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import { useZodForm } from "@/lib/forms/use-zod-form";
import type { KeywordRow } from "@/lib/queries/keywords";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { newScheduleDefaults } from "@/lib/schedules/form-defaults";
import { suggestedScheduleName } from "@/lib/schedules/suggested-name";
import { rankMembershipChange, rankScheduleChange } from "@/lib/schedules/web-change";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { NewScheduleFromSelection } from "./NewScheduleFromSelection";
import { SetScheduleModalChoices } from "./SetScheduleModalChoices";
import { scheduleMonthlyDeltaLabel } from "./schedule-monthly-delta";
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
function matchesSchedule(row: KeywordRow, schedule: CheckScheduleSummary) {
  return row.checkSchedule?.publicId === schedule.publicId;
}
function SetScheduleModalAttempt({
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
  const spendReview = useScheduleSpendReview(projectId);
  const reviewMessages = useTranslations("shared.scheduleReview");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const t = useTranslations("projectRankTracker.keywordImport.management.schedule");
  const usage = useNativeUsageFormat();
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
  const form = useZodForm<NewScheduleValues>(newScheduleSchema, {
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
    setCreatedId(null);
    setError(null);
    form.setValue("choice", nextChoice, { shouldDirty: true, shouldValidate: true });
  }
  function openNewSchedule() {
    setCreatedId(null);
    setError(null);
    setView("new");
    form.setValue("mode", "new");
  }
  function backToChoices() {
    setCreatedId(null);
    setError(null);
    setView("choose");
    form.reset({ ...form.formState.defaultValues, choice, mode: "choose" });
  }
  function monthlyDelta(schedule: CheckScheduleSummary | null) {
    return scheduleMonthlyDeltaLabel({
      currentScheduleId,
      providerRate,
      rows: selectedRows,
      schedule,
      t,
      usage,
    });
  }
  async function save(values: NewScheduleValues) {
    setError(null);
    try {
      let scheduleId = values.choice;
      if (values.mode === "new") {
        const body = newScheduleRequest(values, projectId);
        const created = await spendReview.run(
          rankScheduleChange(projectId, createdId, body),
          (review) =>
            requestApi<{ publicId: string }>(
              createdId ? `/api/check-schedules/${createdId}` : "/api/check-schedules",
              {
                body: JSON.stringify({ ...body, ...(review ? { review } : {}) }),
                method: createdId ? "PATCH" : "POST",
              },
            ),
        );
        scheduleId = created.publicId;
        setCreatedId(scheduleId);
      }
      const membership = { keywordIds: selectedRows.map((row) => row.id), projectId };
      if (scheduleId === "remove") {
        if (!currentScheduleId) throw new CurrentScheduleUnavailableError();
        await spendReview.run(
          rankMembershipChange(projectId, currentScheduleId, membership.keywordIds, "remove"),
          (review) =>
            requestApi(`/api/check-schedules/${currentScheduleId}/keywords`, {
              body: JSON.stringify({ ...membership, ...(review ? { review } : {}) }),
              method: "DELETE",
            }),
        );
      } else if (scheduleId) {
        const destinationId = scheduleId;
        await spendReview.run(
          rankMembershipChange(projectId, destinationId, membership.keywordIds),
          (review) =>
            requestApi(`/api/check-schedules/${destinationId}/keywords`, {
              body: JSON.stringify({ ...membership, ...(review ? { review } : {}) }),
              method: "POST",
            }),
          { emptyScheduleCreated: values.mode === "new" },
        );
      }
      showToast(view === "new" ? t("created") : t("updated"), { severity: "success" });
      onDone();
    } catch (cause) {
      if (cause instanceof ScheduleReviewCancelled) return;
      setError(scheduleSaveError(cause, sharedErrors, t));
    }
  }
  return (
    <>
      {spendReview.dialog}
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
            <Button
              disabled={form.formState.isSubmitting}
              onClick={onClose}
              type="button"
              variant="ghost"
            >
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
        dismissDisabled={form.formState.isSubmitting}
        headerDivider
        onClose={onClose}
        open={open}
        primaryActionDisabled={disabled}
        size="sm"
        title={title}
      >
        <form className="grid gap-3" id={formId} onSubmit={form.handleSubmit(save)}>
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
          {createdId ? (
            <p className="m-0 text-sm text-fg-muted">{reviewMessages("emptyScheduleCreated")}</p>
          ) : null}
          {error ? <p className="m-0 text-[11.5px] text-red-text">{error}</p> : null}
        </form>
      </Modal>
    </>
  );
}
export function SetScheduleModal(props: Readonly<SetScheduleModalProps>) {
  const attempt = JSON.stringify([
    props.open,
    props.projectId,
    props.selectedRows.map((row) => row.id),
  ]);
  return <SetScheduleModalAttempt key={attempt} {...props} />;
}
