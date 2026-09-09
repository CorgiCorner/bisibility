"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { archiveCheckScheduleSchema } from "@/lib/schemas/check-schedule-lifecycle";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { scheduleLifecycleRequest } from "./ScheduleLifecycleActions";
import type { ScheduleListRow } from "./SchedulesList";

const formSchema = archiveCheckScheduleSchema.pick({ destinationScheduleId: true });
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
  const router = useRouter();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ destinationScheduleId: string | null }>({
    defaultValues: { destinationScheduleId: null },
    resolver: zodResolver(formSchema),
  });
  const destination = form.watch("destinationScheduleId");
  const options = [
    { value: "", label: "Manual checks" },
    ...schedules
      .filter((item) => !item.archivedAt && item.publicId !== schedule.publicId)
      .map((item) => ({
        value: item.publicId,
        label: `${item.name}${item.enabled ? "" : " (paused)"}`,
      })),
  ];
  const count = schedule.assignedKeywordCount ?? schedule.keywordCount;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await scheduleLifecycleRequest(projectId, schedule.publicId, "archive", values);
      showToast("Schedule archived. Past runs and results are preserved.", { severity: "success" });
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not archive the schedule.");
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      dismissDisabled={form.formState.isSubmitting}
      title={`Archive “${schedule.name}”?`}
      footer={
        <>
          <Button variant="ghost" disabled={form.formState.isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={form.formState.isSubmitting}
            loadingLabel="Archiving..."
            onClick={() => void submit()}
          >
            Archive schedule
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-sm text-fg-muted">
          Future runs will stop. Runs already launched can finish, and past results remain
          available.
        </p>
        {count > 0 ? (
          <div className="grid gap-2">
            <span className="text-sm font-medium text-fg">
              Move {count} {count === 1 ? "keyword" : "keywords"} to
            </span>
            <MenuSelect
              ariaLabel="Move keywords to"
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
          <p className="m-0 text-sm text-fg-muted">
            This is the default schedule. New keywords will use manual checks until you choose
            another default.
          </p>
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
