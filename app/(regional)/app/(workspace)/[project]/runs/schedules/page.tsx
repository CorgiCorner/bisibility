import { ProjectRunsFeatureBoundary } from "@/components/project-runs/ProjectRunsFeatureBoundary";
import { ProjectRunsTabs } from "@/components/project-runs/ProjectRunsTabs";
import { type ScheduleListRow, SchedulesList } from "@/components/schedules/SchedulesList";
import { PageContent } from "@/components/shell/PageContent";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { listCheckScheduleRows } from "@/lib/queries/check-schedule-list";
import { listRankCheckRuns } from "@/lib/queries/rank-check-runs";
import { asProjectRef } from "@/lib/routing/app-path";

type SchedulesPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ status?: string }>;
};

export default async function SchedulesPage({
  params,
  searchParams,
}: Readonly<SchedulesPageProps>) {
  const { project } = await params;
  const status = (await searchParams)?.status === "archived" ? "archived" : "current";
  const { publicId } = await resolveProjectAccess(project);
  const readable = await requireReadableProject(publicId);
  const projectRef = asProjectRef(publicId);
  const [schedules, planned] = await Promise.all([
    listCheckScheduleRows(readable.project.id, status),
    listRankCheckRuns(
      readable.project.id,
      new URL("http://localhost/api/rank-check-runs?segment=planned&limit=200"),
    ),
  ]);
  const nextRunBySchedule = new Map(
    [...planned.data]
      .reverse()
      .flatMap((run) =>
        run.checkSchedulePublicId ? [[run.checkSchedulePublicId, run] as const] : [],
      ),
  );
  const rows: ScheduleListRow[] = schedules.map((schedule) => {
    const nextRun = nextRunBySchedule.get(schedule.publicId);
    return {
      archivedAt: schedule.archivedAt,
      assignedKeywordCount: schedule.assignedKeywordCount,
      blocked: nextRun?.status === "blocked",
      cronExpression: schedule.cronExpression,
      dayOfMonth: schedule.dayOfMonth,
      enabled: schedule.enabled,
      frequency: schedule.frequency,
      isDefault: schedule.isDefault,
      jitterMinutes: schedule.jitterMinutes,
      keywordCount: schedule.keywordCount,
      memberDeviceCount: schedule.memberDeviceCount,
      memberMarketCount: schedule.memberMarketCount,
      name: schedule.name,
      nextRunAt: nextRun?.plannedFor ?? null,
      perRunCents: schedule.perRunCents,
      publicId: schedule.publicId,
      sharedTag: schedule.sharedTag,
      targetCount: schedule.targetCount,
      timeOfDay: schedule.timeOfDay,
      timezone: schedule.timezone,
      weekday: schedule.weekday,
    };
  });
  const role = getProjectRole(readable.actor, readable.project.id);

  return (
    <ProjectRunsFeatureBoundary>
      <PageContent className="grid gap-4">
        <ProjectRunsTabs active="schedules" projectRef={projectRef} />
        <SchedulesList
          status={status}
          canManage={canProjectAction(role, "manage", "check_schedule")}
          canUpdate={canProjectAction(role, "update", "check_schedule")}
          projectId={publicId}
          projectRef={projectRef}
          schedules={rows}
        />
      </PageContent>
    </ProjectRunsFeatureBoundary>
  );
}
