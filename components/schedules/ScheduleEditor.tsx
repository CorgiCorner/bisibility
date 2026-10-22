"use client";

import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { suggestedScheduleName } from "@/lib/schedules/suggested-name";
import { VIEWER_PREVIEW_ONLY_LABEL } from "@/lib/ui/viewer-affordances";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AddKeywordsDrawer } from "./AddKeywordsDrawer";
import { ScheduleEditorFields } from "./ScheduleEditorFields";
import { ScheduleEditorMembers } from "./ScheduleEditorMembers";
import {
  type ScheduleEditorMember,
  type ScheduleEditorProps,
  type ScheduleEditorValues,
  scheduleEditorDefaults,
  scheduleEditorSchema,
} from "./ScheduleEditorModel";
import { ScheduleSaveConfirmation } from "./SchedulePlanningNotice";
import { payload, request, saveErrorKey } from "./schedule-editor-request";
import { useScheduleMemberRemoval } from "./useScheduleMemberRemoval";
import { useScheduleNameLabels } from "./useScheduleNameLabels";

export function ScheduleEditor({
  canEdit = true,
  candidates = [],
  connectedProviders,
  defaultScheduleName,
  embedded = false,
  isNew = false,
  initialSaveConfirmed = false,
  planningMinutes = null,
  members = [],
  memberSummary,
  onCancel,
  onSaved,
  pendingMembers: initialPendingMembers = [],
  projectId,
  projectDefaults,
  projectTimezone,
  referenceIso,
  schedule,
  showDefaultControl = true,
}: Readonly<ScheduleEditorProps>) {
  const t = useTranslations("projectRuns.schedules");
  const scheduleNames = useScheduleNameLabels();
  const router = useRouter();
  const { showToast } = useToast();
  const editorDefaults = scheduleEditorDefaults(schedule);
  const form = useForm<ScheduleEditorValues>({
    defaultValues: {
      ...editorDefaults,
      // A brand-new schedule arrives without a name, so the suggestion is built from the
      // viewer's catalog rather than an English literal in the defaults module.
      name: editorDefaults.name || suggestedScheduleName(editorDefaults, scheduleNames),
      isDefault: (isNew && defaultScheduleName === null) || schedule.isDefault,
    },
    resolver: zodResolver(scheduleEditorSchema),
  });
  const [saveConfirmed, setSaveConfirmed] = useState(initialSaveConfirmed);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingMembers, setPendingMembers] =
    useState<readonly ScheduleEditorMember[]>(initialPendingMembers);
  const memberRemoval = useScheduleMemberRemoval({
    canEdit,
    projectId,
    scheduleId: schedule.publicId,
    pendingMembers,
    setPendingMembers,
  });
  const [message, setMessage] = useState<string | null>(null);
  const { formState } = form;
  const storedMembers = members.length
    ? members
    : candidates.filter((candidate) => candidate.scheduleId === schedule.publicId);
  const drawerCandidates = candidates.map((candidate) => ({
    assigned: candidate.scheduleId === schedule.publicId,
    checks: candidate.targetCount,
    device: candidate.device,
    id: candidate.publicId,
    keyword: candidate.name,
    market: candidate.market,
    sourceName: candidate.sourceName,
    tags: candidate.tags,
  }));

  function stageMembers(keywordIds: readonly string[]) {
    if (!canEdit) return;
    const additions = candidates
      .filter((candidate) => keywordIds.includes(candidate.publicId))
      .map((candidate) => ({ ...candidate, pending: true }));
    setPendingMembers((current) => [
      ...current,
      ...additions.filter(
        (candidate) => !current.some((member) => member.publicId === candidate.publicId),
      ),
    ]);
    setPickerOpen(false);
  }

  async function save(values: ScheduleEditorValues) {
    setMessage(null);
    setSaveConfirmed(false);
    try {
      const saved = isNew
        ? await request<{ publicId: string }>(
            "/api/check-schedules",
            "POST",
            payload(values, projectId),
          )
        : await request<{ publicId: string }>(
            `/api/check-schedules/${schedule.publicId}`,
            "PATCH",
            payload(values, projectId),
          );
      const scheduleId = saved.publicId;
      if (values.isDefault && !schedule.isDefault) {
        await request(`/api/check-schedules/${scheduleId}/set-default`, "POST", { projectId });
      }
      if (pendingMembers.length) {
        await request(`/api/check-schedules/${scheduleId}/keywords`, "POST", {
          keywordIds: pendingMembers.map((member) => member.publicId),
          projectId,
        });
      }
      form.reset(values);
      setPendingMembers([]);
      setSaveConfirmed(true);
      showToast(t("editor.saved"), { severity: "success" });
      if (onSaved)
        onSaved({
          publicId: scheduleId,
          name: values.name,
          frequency: values.frequency,
          isDefault: values.isDefault,
        });
      else if (isNew) router.replace(`${projectSchedulesPath(projectId, scheduleId)}?saved=1`);
      else router.refresh();
    } catch (error) {
      setMessage(t(`editor.${saveErrorKey(error)}`));
    }
  }

  return (
    <form
      className="grid min-w-0 gap-[18px]"
      noValidate
      onSubmit={
        canEdit
          ? form.handleSubmit((values) => void save(values))
          : (event) => event.preventDefault()
      }
    >
      {saveConfirmed && !formState.isDirty && pendingMembers.length === 0 ? (
        <ScheduleSaveConfirmation
          minutes={planningMinutes}
          showPlanningHint={
            schedule.enabled && (storedMembers.length > 0 || schedule.keywordCount > 0)
          }
        />
      ) : null}
      <div
        className={
          embedded
            ? "grid min-w-0 gap-3.5"
            : "grid min-w-0 gap-3.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
        }
      >
        <section className="order-2 min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev lg:order-1">
          <header className="border-b border-border px-4 py-3.5">
            <h2 className="m-0 text-[15px] font-semibold text-fg">{t("schedule")}</h2>
          </header>
          <fieldset className="contents" disabled={!canEdit}>
            <ScheduleEditorFields
              connectedProviders={connectedProviders}
              defaultScheduleName={defaultScheduleName}
              form={form}
              projectDefaults={projectDefaults}
              projectTimezone={projectTimezone}
              referenceIso={referenceIso}
              showDefaultControl={showDefaultControl}
            />
          </fieldset>
        </section>
        {embedded ? (
          <p className="m-0 text-[12px] text-fg-muted">{memberSummary}</p>
        ) : (
          <div className="order-1 min-w-0 self-start lg:order-2">
            <ScheduleEditorMembers
              canEdit={canEdit}
              memberCount={storedMembers.length + pendingMembers.length}
              memberSummary={memberSummary}
              onOpenDrawer={() => setPickerOpen(true)}
              onRemove={memberRemoval.remove}
              removalError={memberRemoval.error}
              removingId={memberRemoval.pendingId}
              pendingMembers={pendingMembers}
              scheduleName={form.watch("name") || t("thisSchedule")}
              storedMembers={storedMembers}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {message ? (
          <span className="mr-auto text-[12px] text-fg-muted" role="alert">
            {message}
          </span>
        ) : null}
        {canEdit ? null : <StatusChip label={VIEWER_PREVIEW_ONLY_LABEL} tone="neutral" />}
        {!embedded ? (
          <Button
            onClick={() =>
              onCancel ? onCancel() : router.replace(projectSchedulesPath(projectId))
            }
            type="button"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            disabled={!isNew && !formState.isDirty && pendingMembers.length === 0}
            loading={formState.isSubmitting}
            loadingLabel={t("editor.saving")}
            type="submit"
          >
            {t("editor.save")}
          </Button>
        ) : null}
      </div>
      {canEdit ? (
        <AddKeywordsDrawer
          candidates={drawerCandidates.map((candidate) => ({
            ...candidate,
            assigned:
              candidate.assigned ||
              pendingMembers.some((member) => member.publicId === candidate.id),
          }))}
          onAssigned={() => router.refresh()}
          onClose={() => setPickerOpen(false)}
          onSelect={isNew ? stageMembers : undefined}
          open={pickerOpen}
          projectId={projectId}
          scheduleId={schedule.publicId}
          scheduleName={form.watch("name") || t("thisSchedule")}
        />
      ) : null}
    </form>
  );
}
