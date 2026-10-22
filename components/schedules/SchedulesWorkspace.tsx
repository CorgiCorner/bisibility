"use client";

import { AiScheduleDrawerHost } from "@/components/ai-tracking/AiScheduleDrawerHost";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { mutateAiTrackingAction } from "@/lib/actions/ai-tracking";
import type { TrackingScheduleList } from "@/lib/ai-tracking/projections/schedule-list";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { type AiSchedulesController, toAiScheduleListRow } from "./ai-schedule-rows";
import type { ScheduleEditorCandidate } from "./ScheduleEditorModel";
import { SchedulePlanningNotice } from "./SchedulePlanningNotice";
import { type ScheduleListRow, SchedulesList } from "./SchedulesList";
import { UnscheduledKeywordsNotice } from "./UnscheduledKeywordsNotice";

type SchedulesWorkspaceProps = {
  /** Null when AI tracking is unavailable to this actor; the rank list still renders. */
  ai: TrackingScheduleList | null;
  /** `?ai=` target: an AI schedule public id or `new`. */
  aiTarget: string | null;
  aiUnavailable?: boolean;
  canManage: boolean;
  canUpdate: boolean;
  projectId: string;
  projectRef: string;
  schedules: readonly ScheduleListRow[];
  status: "current" | "archived";
  candidates?: readonly ScheduleEditorCandidate[];
  planningMinutes?: number | null;
};

/** Common Schedules controller: rank rows keep rank endpoints, AI rows use AI tracking actions. */
export function SchedulesWorkspace({
  ai,
  aiTarget,
  aiUnavailable = false,
  canManage,
  canUpdate,
  projectId,
  projectRef,
  schedules,
  status,
  candidates = [],
  planningMinutes = null,
}: Readonly<SchedulesWorkspaceProps>) {
  const router = useRouter();
  const t = useTranslations("projectRuns.schedules");
  const controller = useMemo<AiSchedulesController | undefined>(
    () =>
      ai
        ? {
            canWrite: ai.canWrite,
            activePromptCount: ai.activePromptIds.length,
            rows: ai.schedules.map(toAiScheduleListRow),
            onPause: async (row) => {
              await mutateAiTrackingAction(
                projectId,
                "schedules",
                "PATCH",
                { enabled: false },
                row.publicId,
              );
              router.refresh();
            },
            onArchive: async (row) => {
              await mutateAiTrackingAction(projectId, "schedules", "DELETE", {}, row.publicId);
              router.refresh();
            },
          }
        : undefined,
    [ai, projectId, router],
  );
  const listPath = `${projectSchedulesPath(projectRef)}${status === "archived" ? "?status=archived" : ""}`;
  return (
    <>
      {aiUnavailable ? (
        <AlertBanner
          tint="yellow"
          title={t("ai.loadFailed")}
          action={{ label: t("ai.retry"), icon: "retry", onClick: () => router.refresh() }}
        />
      ) : null}
      {status === "current" ? (
        <UnscheduledKeywordsNotice
          canEdit={canUpdate}
          candidates={candidates}
          schedules={schedules}
          projectId={projectRef}
        />
      ) : null}
      {status === "current" &&
      schedules.some(
        (schedule) => schedule.enabled && schedule.keywordCount > 0 && !schedule.archivedAt,
      ) ? (
        <SchedulePlanningNotice minutes={planningMinutes} />
      ) : null}
      <SchedulesList
        ai={controller}
        status={status}
        canManage={canManage}
        canUpdate={canUpdate}
        projectId={projectId}
        projectRef={projectRef}
        schedules={schedules}
      />
      {ai?.canWrite && aiTarget && status === "current" ? (
        <AiScheduleDrawerHost
          key={aiTarget}
          activePromptIds={ai.activePromptIds}
          projectId={projectId}
          schedules={ai.schedules}
          target={aiTarget}
          onClose={() => router.replace(listPath)}
          onSaved={() => {
            router.replace(listPath);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
