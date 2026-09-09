import { ProjectRunsTabs } from "@/components/project-runs/ProjectRunsTabs";
import { ArchivedScheduleDetails } from "@/components/schedules/ArchivedScheduleDetails";
import { ScheduleEditor } from "@/components/schedules/ScheduleEditor";
import { newEditorSchedule } from "@/components/schedules/ScheduleEditorModel";
import { ScheduleObjectFrame } from "@/components/schedules/ScheduleObjectFrame";
import { IdChip } from "@/components/ui/IdChip";
import { ApiNotFoundError } from "@/lib/api/errors";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { providerLabel } from "@/lib/checks/attempts";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { listScheduleMemberCandidates } from "@/lib/queries/check-schedule-members";
import { getCheckSchedule, listCheckSchedules } from "@/lib/queries/rank-check-runs";
import { scheduleRunHistory } from "@/lib/queries/schedule-run-history";
import {
  getRequestProjectDefaults,
  getRequestSerpProviderChain,
} from "@/lib/queries/workspace-request-data";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { scheduleCadenceLabel } from "@/lib/schedules/cadence-label";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { notFound } from "next/navigation";

type SchedulePageProps = {
  params: Promise<{ project: string; publicId: string }>;
  referenceIso?: string;
  searchParams?: Promise<{ cursor?: string }>;
};

export default async function SchedulePage({
  params,
  searchParams,
  referenceIso = new Date().toISOString(),
}: Readonly<SchedulePageProps>) {
  const { project, publicId: scheduleId } = await params;
  const { projectId, publicId: projectPublicId } = await resolveProjectAccess(project);
  const readable = await requireReadableProject(projectPublicId);
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
  const editorSchedule = schedule ?? newEditorSchedule;
  const history = schedule?.archivedAt
    ? await scheduleRunHistory(projectId, scheduleId, (await searchParams)?.cursor)
    : null;

  return (
    <ScheduleObjectFrame
      bodyLabel={schedule?.archivedAt ? "Archived schedule" : "Schedule editor"}
      navigation={<ProjectRunsTabs active="schedules" projectRef={projectPublicId} />}
      breadcrumb={{
        href: `${projectSchedulesPath(projectPublicId)}${schedule?.archivedAt ? "?status=archived" : ""}`,
        label: schedule?.archivedAt ? "Archived schedules" : "All schedules",
      }}
      subtitle={
        schedule ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{scheduleCadenceLabel(schedule)}</span>
            <IdChip copyLabel="Copy schedule ID" size="xs" value={schedule.publicId} />
          </span>
        ) : (
          "Not saved yet. It runs on its cadence once saved with at least one keyword."
        )
      }
      title={isNew ? "New schedule" : editorSchedule.name}
    >
      {history ? (
        <ArchivedScheduleDetails
          canManage={canProjectAction(
            getProjectRole(readable.actor, projectId),
            "manage",
            "check_schedule",
          )}
          history={history.data}
          nextCursor={history.nextCursor}
          projectId={projectPublicId}
          projectTimezone={defaults?.timezone ?? "UTC"}
          projectDepth={resolveSerpDepth(defaults?.serpDepth ?? undefined)}
          providerLabel={
            schedule?.providerPolicy && schedule.providerPolicy !== "project"
              ? providerLabel(schedule.providerPolicy)
              : "Project default"
          }
          schedule={editorSchedule}
        />
      ) : (
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
      )}
    </ScheduleObjectFrame>
  );
}
