import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { ScheduleListRow } from "@/components/schedules/SchedulesList";
import { SchedulesWorkspace } from "@/components/schedules/SchedulesWorkspace";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiTrackingScheduleList } from "@/lib/actions/ai-tracking";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { listScheduleMemberCandidates } from "@/lib/queries/check-schedule-members";
import { listRankCheckRuns } from "@/lib/queries/rank-check-runs";
import { asProjectRef } from "@/lib/routing/app-path";
import { settableDataSyncKinds } from "@/lib/schedules/data-sync-permission";
import { schedulePlanningMinutes } from "@/lib/schedules/planning-visibility";
import { listSchedules } from "@/lib/schedules/service";
import { unstable_rethrow } from "next/navigation";

type SchedulesPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ ai?: string; status?: string }>;
};

/** The common schedules boundary owns every catalog its client subtree reads. */
async function loadSchedulesMessages() {
  const runtime = await resolveRegionalDocumentLocale();
  return {
    ...runtime,
    messages: await loadCoreMessages(runtime.locale, [
      "shared",
      "projectRuns",
      "projectAiTracking",
    ]),
  };
}

export default async function SchedulesPage({
  params,
  searchParams,
}: Readonly<SchedulesPageProps>) {
  const { project } = await params;
  const query = await searchParams;
  const status = query?.status === "archived" ? "archived" : "current";
  const { publicId } = await resolveProjectAccess(project);
  const readable = await requireReadableProject(publicId);
  const projectRef = asProjectRef(publicId);
  const [planned, aiResult, candidates] = await Promise.all([
    listRankCheckRuns(
      readable.project.id,
      new URL("http://localhost/api/rank-check-runs?segment=planned&limit=200"),
    ),
    getAiTrackingScheduleList(publicId, status).then(
      (value) => ({ value, unavailable: false }),
      (error: unknown) => {
        unstable_rethrow(error);
        console.warn("AI schedules could not be loaded", {
          errorType: error instanceof Error ? error.name : "unknown",
        });
        return { value: null, unavailable: true };
      },
    ),
    status === "current" ? listScheduleMemberCandidates(publicId) : Promise.resolve([]),
  ]);
  const ai = aiResult.value;
  const unified = await listSchedules(readable.project.id, { status, ai: ai?.schedules ?? null });
  const schedules = unified.filter((row) => row.kind === "rank").map((row) => row.rank);
  const runtime = await loadSchedulesMessages();
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
      jitterMinutes: schedule.jitterMinutes,
      keywordCount: schedule.keywordCount,
      memberDeviceCount: schedule.memberDeviceCount,
      memberMarketCount: schedule.memberMarketCount,
      name: schedule.name,
      nextRunAt: nextRun?.plannedFor ?? null,
      perRunCents: schedule.perRunCents,
      nativeEstimate: schedule.nativeEstimate,
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
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={runtime.messages}
      timeZone={runtime.timeZone}
    >
      <PageContent className="grid gap-4">
        <SchedulesWorkspace
          ai={ai}
          unifiedSchedules={unified}
          aiUnavailable={aiResult.unavailable}
          aiTarget={typeof query?.ai === "string" ? query.ai : null}
          status={status}
          canManage={canProjectAction(role, "manage", "check_schedule")}
          canUpdate={canProjectAction(role, "update", "check_schedule")}
          canUpdateSyncs={settableDataSyncKinds(role)}
          projectId={publicId}
          projectRef={projectRef}
          schedules={rows}
          candidates={candidates}
          planningMinutes={schedulePlanningMinutes()}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
