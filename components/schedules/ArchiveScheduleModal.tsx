"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { archiveCheckScheduleSchema } from "@/lib/schemas/check-schedule-lifecycle";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { scheduleLifecycleRequest } from "./ScheduleLifecycleActions";
import type { ScheduleListRow } from "./SchedulesList";

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
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ destinationScheduleId: string | null }>({
    defaultValues: { destinationScheduleId: null },
    resolver: zodResolver(formSchema),
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
      await scheduleLifecycleRequest(projectId, schedule.publicId, "archive", values);
      showToast(t("lifecycle.archived"), { severity: "success" });
      onClose();
      router.refresh();
    } catch (error) {
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
    <Modal
      open
      onClose={onClose}
      dismissDisabled={form.formState.isSubmitting}
      title={t("archiveDialog.title", { name: schedule.name })}
      footer={
        <>
          <Button variant="ghost" disabled={form.formState.isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
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
          <div className="grid gap-2">
            <span className="text-sm font-medium text-fg">
              {t("archiveDialog.moveKeywords", { count })}
            </span>
            <MenuSelect
              ariaLabel={t("archiveDialog.moveKeywords", { count })}
              size="input"
              value={destination ?? ""}
              options={options}
              onChange={(value) =>
                form.setValue("destinationScheduleId", value || null, { shouldValidate: true })
              }
            />
          </div>
        ) : null}
        {schedule.isDefault ? (
          <p className="m-0 text-sm text-fg-muted">{t("archiveDialog.defaultNotice")}</p>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
