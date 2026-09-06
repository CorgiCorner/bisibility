"use client";

import { Button, useToast } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { rankTrackerSchedulesPath } from "@/lib/routing/rank-tracker-schedules-path";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AddKeywordsDrawer } from "./AddKeywordsDrawer";
import { ScheduleEditorFields } from "./ScheduleEditorFields";
import { ScheduleEditorMembers } from "./ScheduleEditorMembers";
import {
  calendarCronExpression,
  type ScheduleEditorMember,
  type ScheduleEditorProps,
  type ScheduleEditorValues,
  scheduleEditorDefaults,
  scheduleEditorSchema,
} from "./ScheduleEditorModel";

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
  candidates = [],
  connectedProviders,
  defaultScheduleName,
  isNew = false,
  members = [],
  memberSummary,
  pendingMembers: initialPendingMembers = [],
  projectId,
  projectDefaults,
  projectTimezone,
  referenceIso,
  schedule,
}: Readonly<ScheduleEditorProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const form = useForm<ScheduleEditorValues>({
    defaultValues: {
      ...scheduleEditorDefaults(schedule),
      isDefault: defaultScheduleName === null || schedule.isDefault,
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
    checks: String(candidate.targetCount),
    device: candidate.device,
    id: candidate.publicId,
    keyword: candidate.name,
    market: candidate.market,
    sourceName: candidate.sourceName,
    tags: candidate.tags,
  }));

  function stageMembers(keywordIds: readonly string[]) {
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
      showToast("Schedule saved.", { severity: "success" });
      if (isNew) router.replace(rankTrackerSchedulesPath(projectId, scheduleId));
      else router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the schedule.");
    }
  }

  return (
    <form
      className="grid gap-[18px]"
      noValidate
      onSubmit={form.handleSubmit((values) => void save(values))}
    >
      <div className="grid min-w-0 gap-3.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
          <header className="border-b border-border px-4 py-3.5">
            <h2 className="m-0 text-[15px] font-semibold text-fg">Schedule</h2>
          </header>
          <ScheduleEditorFields
            connectedProviders={connectedProviders}
            defaultScheduleName={defaultScheduleName}
            form={form}
            projectDefaults={projectDefaults}
            projectTimezone={projectTimezone}
            referenceIso={referenceIso}
          />
        </section>
        <ScheduleEditorMembers
          memberCount={storedMembers.length + pendingMembers.length}
          memberSummary={memberSummary}
          onOpenDrawer={() => setPickerOpen(true)}
          pendingMembers={pendingMembers}
          scheduleName={form.watch("name") || "this schedule"}
          storedMembers={storedMembers}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {message ? <span className="mr-auto text-[12px] text-fg-muted">{message}</span> : null}
        <Button
          onClick={() => router.replace(rankTrackerSchedulesPath(projectId))}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button loading={formState.isSubmitting} loadingLabel="Saving..." type="submit">
          Save schedule
        </Button>
      </div>
      <AddKeywordsDrawer
        candidates={drawerCandidates.map((candidate) => ({
          ...candidate,
          assigned:
            candidate.assigned || pendingMembers.some((member) => member.publicId === candidate.id),
        }))}
        onAssigned={() => router.refresh()}
        onClose={() => setPickerOpen(false)}
        onSelect={isNew ? stageMembers : undefined}
        open={pickerOpen}
        projectId={projectId}
        scheduleId={schedule.publicId}
        scheduleName={form.watch("name") || "this schedule"}
      />
    </form>
  );
}
