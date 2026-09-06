import { ScheduleEditor } from "@/components/schedules/ScheduleEditor";
import { ScheduleObjectFrame } from "@/components/schedules/ScheduleObjectFrame";
import { ApiNotFoundError } from "@/lib/api/errors";
import { providerLabel } from "@/lib/checks/attempts";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { listScheduleMemberCandidates } from "@/lib/queries/check-schedule-members";
import { getCheckSchedule, listCheckSchedules } from "@/lib/queries/rank-check-runs";
import {
  getRequestProjectDefaults,
  getRequestSerpProviderChain,
} from "@/lib/queries/workspace-request-data";
import { rankTrackerSchedulesPath } from "@/lib/routing/rank-tracker-schedules-path";
import { resolveSerpDepth } from "@/lib/serp/markets";
import { notFound } from "next/navigation";

type SchedulePageProps = {
  params: Promise<{ project: string; publicId: string }>;
  referenceIso?: string;
};

export default async function SchedulePage({
  params,
  referenceIso = new Date().toISOString(),
}: Readonly<SchedulePageProps>) {
  const { project, publicId: scheduleId } = await params;
  const { projectId, publicId: projectPublicId } = await resolveProjectAccess(project);
  await requireReadableProject(projectPublicId);
  const isNew = scheduleId === "new";
  let defaults: Awaited<ReturnType<typeof getRequestProjectDefaults>>;
  let schedules: Awaited<ReturnType<typeof listCheckSchedules>>;
  let schedule: Awaited<ReturnType<typeof getCheckSchedule>> | null;
  let candidates: Awaited<ReturnType<typeof listScheduleMemberCandidates>>;
  let serpProviderChain: Awaited<ReturnType<typeof getRequestSerpProviderChain>>;
  try {
    [defaults, schedules, schedule, candidates, serpProviderChain] = await Promise.all([
      getRequestProjectDefaults(projectId),
      listCheckSchedules(projectId),
      isNew ? Promise.resolve(null) : getCheckSchedule(projectId, scheduleId),
      listScheduleMemberCandidates(projectPublicId),
      getRequestSerpProviderChain(projectId),
    ]);
  } catch (error) {
    if (error instanceof ApiNotFoundError) notFound();
    throw error;
  }
  const connectedProviders = serpProviderChain.map(({ provider }) => ({
    label: providerLabel(provider),
    value: provider,
  }));
  if (!isNew && !schedule) notFound();
  const editorSchedule = schedule ?? {
    cronExpression: null,
    enabled: true,
    frequency: "daily" as const,
    isDefault: false,
    jitterMinutes: 15,
    keywordCount: 0,
    name: "Daily 06:00",
    providerPolicy: null,
    publicId: "new",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: null,
  };

  return (
    <ScheduleObjectFrame
      bodyLabel="Schedule editor"
      breadcrumb={{ href: rankTrackerSchedulesPath(projectPublicId), label: "All schedules" }}
      subtitle={
        isNew
          ? "Not saved yet. It runs on its cadence once saved with at least one keyword."
          : `${editorSchedule.frequency}, ${editorSchedule.timeOfDay ?? "custom cron"} · ${editorSchedule.publicId}`
      }
      title={editorSchedule.name}
    >
      <ScheduleEditor
        candidates={candidates}
        connectedProviders={connectedProviders}
        defaultScheduleName={schedules.find((item) => item.isDefault)?.name ?? null}
        isNew={isNew}
        projectId={projectPublicId}
        projectDefaults={{
          provider: connectedProviders[0] ?? null,
          serpDepth: resolveSerpDepth(defaults?.serpDepth ?? undefined),
        }}
        projectTimezone={defaults?.timezone ?? "UTC"}
        referenceIso={referenceIso}
        schedule={editorSchedule}
      />
    </ScheduleObjectFrame>
  );
}
