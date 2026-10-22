import {
  loadProjectRunsMessages,
  ProjectRunsFeatureBoundary,
} from "@/components/project-runs/ProjectRunsFeatureBoundary";
import { ProjectRunsTabs } from "@/components/project-runs/ProjectRunsTabs";
import { ArchivedScheduleDetails } from "@/components/schedules/ArchivedScheduleDetails";
import { ScheduleDetailsSummary } from "@/components/schedules/ScheduleDetailsSummary";
import { ScheduleEditor } from "@/components/schedules/ScheduleEditor";
import { newEditorSchedule } from "@/components/schedules/ScheduleEditorModel";
import { ScheduleObjectFrame } from "@/components/schedules/ScheduleObjectFrame";
import { UnscheduledKeywordsNotice } from "@/components/schedules/UnscheduledKeywordsNotice";
import { IdChip } from "@/components/ui/IdChip";
import { createIntlTranslator } from "@/i18n/translator.server";
import { ApiNotFoundError } from "@/lib/api/errors";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { providerLabel } from "@/lib/checks/attempts";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { listCheckScheduleRows } from "@/lib/queries/check-schedule-list";
import { listScheduleMemberCandidates } from "@/lib/queries/check-schedule-members";
import { getCheckSchedule } from "@/lib/queries/rank-check-runs";
import { scheduleRunHistory } from "@/lib/queries/schedule-run-history";
import {
  getRequestProjectDefaults,
  getRequestSerpProviderChain,
} from "@/lib/queries/workspace-request-data";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { scheduleCadenceLabel } from "@/lib/schedules/cadence-label";
import { schedulePlanningMinutes } from "@/lib/schedules/planning-visibility";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { notFound } from "next/navigation";

type SchedulePageProps = {
  params: Promise<{ project: string; publicId: string }>;
  referenceIso?: string;
  searchParams?: Promise<{ cursor?: string; saved?: string }>;
};

export default async function SchedulePage({
  params,
  searchParams,
  referenceIso = new Date().toISOString(),
}: Readonly<SchedulePageProps>) {
  const { project, publicId: scheduleId } = await params;
  const query = await searchParams;
  const { projectId, publicId: projectPublicId } = await resolveProjectAccess(project);
  const readable = await requireReadableProject(projectPublicId);
  const isNew = scheduleId === "new";
  let defaults: Awaited<ReturnType<typeof getRequestProjectDefaults>>;
  let schedules: Awaited<ReturnType<typeof listCheckScheduleRows>>;
  let schedule: Awaited<ReturnType<typeof getCheckSchedule>> | null;
  let candidates: Awaited<ReturnType<typeof listScheduleMemberCandidates>>;
  let serpProviderChain: Awaited<ReturnType<typeof getRequestSerpProviderChain>>;
  try {
    [defaults, schedules, schedule, candidates, serpProviderChain] = await Promise.all([
      getRequestProjectDefaults(projectId),
      listCheckScheduleRows(projectId),
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
  const summarySchedule = schedules.find((row) => row.publicId === scheduleId);
  const canEdit = canProjectAction(
    getProjectRole(readable.actor, projectId),
    isNew ? "create" : "update",
    "check_schedule",
  );
  if (isNew && !canEdit) notFound();
  const history = schedule?.archivedAt
    ? await scheduleRunHistory(projectId, scheduleId, query?.cursor)
    : null;
  const runtime = await loadProjectRunsMessages();
  const t = createIntlTranslator(runtime.locale, runtime.messages, runtime);
  const cadence = scheduleCadenceLabel(editorSchedule, {
    custom: (expression) => t("projectRuns.schedules.cadenceLabels.custom", { expression }),
    daily: (time) => t("projectRuns.schedules.cadenceLabels.daily", { time }),
    every: (interval) =>
      t("projectRuns.schedules.cadenceLabels.every", {
        interval:
          interval === "day"
            ? t("projectRuns.schedules.intervalDay")
            : interval === "week"
              ? t("projectRuns.schedules.intervalWeek")
              : t("projectRuns.schedules.intervalMonth"),
      }),
    manual: () => t("projectRuns.schedules.cadenceLabels.manual"),
    monthly: (day, time) =>
      t("projectRuns.schedules.cadenceLabels.monthly", {
        day: Number.isInteger(Number.parseInt(day, 10))
          ? t("projectRuns.schedules.cadenceLabels.dayOfMonth", {
              day: Number.parseInt(day, 10),
            })
          : day,
        time,
      }),
    paused: () => t("projectRuns.schedules.cadenceLabels.paused"),
    weekday: (day) => {
      switch (day) {
        case "Sunday":
          return t("projectRuns.schedules.weekdays.Sunday");
        case "Monday":
          return t("projectRuns.schedules.weekdays.Monday");
        case "Tuesday":
          return t("projectRuns.schedules.weekdays.Tuesday");
        case "Wednesday":
          return t("projectRuns.schedules.weekdays.Wednesday");
        case "Thursday":
          return t("projectRuns.schedules.weekdays.Thursday");
        case "Friday":
          return t("projectRuns.schedules.weekdays.Friday");
        case "Saturday":
          return t("projectRuns.schedules.weekdays.Saturday");
      }
    },
    weekly: (day, time) =>
      t("projectRuns.schedules.cadenceLabels.weekly", {
        day: day || t("projectRuns.schedules.frequencyWeekly"),
        time,
      }),
  });

  return (
    <ProjectRunsFeatureBoundary runtime={runtime}>
      <ScheduleObjectFrame
        bodyLabel={
          schedule?.archivedAt
            ? t("projectRuns.schedules.archivedSchedule")
            : t("projectRuns.schedules.scheduleEditor")
        }
        breadcrumbLabel={t("projectRuns.schedules.breadcrumb")}
        navigation={<ProjectRunsTabs active="schedules" projectRef={projectPublicId} />}
        breadcrumb={
          isNew || schedule?.archivedAt
            ? {
                href: `${projectSchedulesPath(projectPublicId)}${schedule?.archivedAt ? "?status=archived" : ""}`,
                label: schedule?.archivedAt
                  ? t("projectRuns.schedules.archivedSchedules")
                  : t("projectRuns.schedules.allSchedules"),
              }
            : undefined
        }
        subtitle={
          schedule ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{cadence}</span>
              <span>{editorSchedule.timezone ?? defaults?.timezone ?? "UTC"}</span>
              <IdChip
                copyLabel={t("projectRuns.schedules.copyScheduleId")}
                size="xs"
                value={schedule.publicId}
              />
            </span>
          ) : (
            t("projectRuns.schedules.unsavedSubtitle")
          )
        }
        title={isNew ? t("projectRuns.schedules.newSchedule") : editorSchedule.name}
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
                : t("projectRuns.schedules.editor.projectDefaultPlain")
            }
            schedule={editorSchedule}
          />
        ) : (
          <div className="grid min-w-0 gap-4">
            {!isNew && summarySchedule ? (
              <ScheduleDetailsSummary
                canEdit={canEdit}
                canManage={canProjectAction(
                  getProjectRole(readable.actor, projectId),
                  "manage",
                  "check_schedule",
                )}
                projectId={projectPublicId}
                schedule={summarySchedule}
                schedules={schedules}
              />
            ) : null}
            <UnscheduledKeywordsNotice
              canEdit={canEdit}
              candidates={candidates}
              schedules={schedules}
              projectId={projectPublicId}
            />
            <ScheduleEditor
              canEdit={canEdit}
              candidates={candidates}
              connectedProviders={connectedProviders}
              defaultScheduleName={schedules.find((item) => item.isDefault)?.name ?? null}
              isNew={isNew}
              initialSaveConfirmed={!isNew && query?.saved === "1"}
              planningMinutes={schedulePlanningMinutes()}
              projectId={projectPublicId}
              projectDefaults={{
                provider: connectedProviders[0] ?? null,
                serpDepth: resolveSerpDepth(defaults?.serpDepth ?? undefined),
              }}
              projectTimezone={defaults?.timezone ?? "UTC"}
              referenceIso={referenceIso}
              schedule={editorSchedule}
              showDefaultControl={isNew}
            />
          </div>
        )}
      </ScheduleObjectFrame>
    </ProjectRunsFeatureBoundary>
  );
}
