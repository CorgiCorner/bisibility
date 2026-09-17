"use client";

import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { calendarCronExpression } from "@/lib/rank-check/schedule-calendar";
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
import { useScheduleNameLabels } from "./useScheduleNameLabels";

type ApiResponse<T> = { data: T };

async function request<T>(url: string, method: "PATCH" | "POST", body: object) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method,
  });
  const payload = (await response.json()) as ApiResponse<T> & { detail?: string };
  if (!response.ok) throw new Error(payload.detail ?? "Could not save the schedule.");
  return payload.data;
}

function payload(values: ScheduleEditorValues, projectId: string) {
  return {
    cronExpression:
      values.frequency === "custom_cron" ? values.cronExpression : calendarCronExpression(values),
    frequency: values.frequency,
    jitterMinutes: Number(values.jitterMinutes),
    name: values.name,
    projectId,
    providerPolicy: values.providerPolicy === "project" ? null : values.providerPolicy,
    serpDepth: values.serpDepth === "project" ? null : Number(values.serpDepth),
    timeOfDay: values.frequency === "custom_cron" ? null : values.timeOfDay || null,
    timezone: values.timezone || null,
  };
}

export function ScheduleEditor({
  canEdit = true,
  candidates = [],
  connectedProviders,
  defaultScheduleName,
  embedded = false,
  isNew = false,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingMembers, setPendingMembers] =
    useState<readonly ScheduleEditorMember[]>(initialPendingMembers);
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
      showToast(t("editor.saved"), { severity: "success" });
      if (onSaved)
        onSaved({
          publicId: scheduleId,
          name: values.name,
          frequency: values.frequency,
          isDefault: values.isDefault,
        });
      else if (isNew) router.replace(projectSchedulesPath(projectId, scheduleId));
      else router.refresh();
    } catch {
      setMessage(t("editor.saveFailed"));
    }
  }

  return (
    <form
      className="grid gap-[18px]"
      noValidate
      onSubmit={
        canEdit
          ? form.handleSubmit((values) => void save(values))
          : (event) => event.preventDefault()
      }
    >
      <div
        className={
          embedded
            ? "grid min-w-0 gap-3.5"
            : "grid min-w-0 gap-3.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
        }
      >
        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
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
            />
          </fieldset>
        </section>
        {embedded ? (
          <p className="m-0 text-[12px] text-fg-muted">{memberSummary}</p>
        ) : (
          <ScheduleEditorMembers
            canEdit={canEdit}
            memberCount={storedMembers.length + pendingMembers.length}
            memberSummary={memberSummary}
            onOpenDrawer={() => setPickerOpen(true)}
            pendingMembers={pendingMembers}
            scheduleName={form.watch("name") || t("thisSchedule")}
            storedMembers={storedMembers}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {message ? <span className="mr-auto text-[12px] text-fg-muted">{message}</span> : null}
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
          <Button loading={formState.isSubmitting} loadingLabel={t("editor.saving")} type="submit">
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
