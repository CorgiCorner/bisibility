"use client";

import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { archiveCheckScheduleSchema } from "@/lib/schemas/check-schedule-lifecycle";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { scheduleLifecycleRequest } from "./ScheduleLifecycleActions";
import type { ScheduleListRow } from "./SchedulesList";
import { ScheduleReviewCancelled, useScheduleSpendReview } from "./useScheduleSpendReview";

const formSchema = archiveCheckScheduleSchema.pick({ destinationScheduleId: true });

function archiveErrorMessage(error: unknown, fallback: string, currentSchedule: string) {
  if (
    error instanceof Error &&
    (error.message === "Choose a current schedule." ||
      error.message === "Choose a current schedule for this project.")
  ) {
    return currentSchedule;
  }
  return fallback;
}
export function ArchiveScheduleModal({
  onClose,
  projectId,
  schedule,
  schedules,
}: Readonly<{
  onClose: () => void;
  projectId: string;
  schedule: ScheduleListRow;
  schedules: readonly ScheduleListRow[];
}>) {
  const t = useTranslations("projectRuns.schedules");
  const router = useRouter();
  const spendReview = useScheduleSpendReview(projectId);
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm<{ destinationScheduleId: string | null }>(formSchema, {
    defaultValues: { destinationScheduleId: null },
  });
  const destination = form.watch("destinationScheduleId");
  const options = [
    { value: "", label: t("archiveDialog.manualChecks") },
    ...schedules
      .filter((item) => !item.archivedAt && item.publicId !== schedule.publicId)
      .map((item) => ({
        value: item.publicId,
        label: `${item.name}${item.enabled ? "" : ` (${t("list.paused")})`}`,
      })),
  ];
  const count = schedule.assignedKeywordCount ?? schedule.keywordCount;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await spendReview.run(
        {
          op: "state",
          id: schedule.publicId,
          state: "archived",
          command: {
            kind: "rank",
            archive: { ...values, scheduleId: schedule.publicId, projectId },
          },
        },
        (review) =>
          scheduleLifecycleRequest(projectId, schedule.publicId, "archive", {
            ...values,
            ...(review ? { review } : {}),
          }),
      );
      showToast(t("lifecycle.archived"), { severity: "success" });
      onClose();
      router.refresh();
    } catch (error) {
      if (error instanceof ScheduleReviewCancelled) return;
      setError(
        archiveErrorMessage(
          error,
          t("lifecycle.archiveFailed"),
          t("lifecycle.currentScheduleUnavailable"),
        ),
      );
    }
  });
  return (
    <>
      {spendReview.dialog}
      <Modal
        open
        onClose={onClose}
        dismissDisabled={form.formState.isSubmitting}
        title={t("archiveDialog.title", { name: schedule.name })}
        footer={
          <>
            <Button
              size="input"
              variant="ghost"
              disabled={form.formState.isSubmitting}
              onClick={onClose}
            >
              {t("cancel")}
            </Button>
            <Button
              size="input"
              loading={form.formState.isSubmitting}
              loadingLabel={t("lifecycle.archiving")}
              onClick={() => void submit()}
            >
              {t("archiveSchedule")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="m-0 text-sm text-fg-muted">{t("archiveDialog.body")}</p>
          {count > 0 ? (
            <FormField label={t("archiveDialog.moveKeywords", { count })}>
              <MenuSelect
                ariaLabel={t("archiveDialog.moveKeywords", { count })}
                size="input"
                value={destination ?? ""}
                options={options}
                onChange={(value) =>
                  form.setValue("destinationScheduleId", value || null, { shouldValidate: true })
                }
              />
            </FormField>
          ) : null}
          {error ? (
            <p role="alert" className="m-0 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
