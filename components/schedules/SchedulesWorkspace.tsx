"use client";
import { scheduleActionClient } from "@/lib/schedules/action-result";

const mutateAiTrackingAction = scheduleActionClient(mutateAiTrackingActionCapacityAction);
const saveDataSyncState = scheduleActionClient(setDataSyncScheduleState);

import { AiScheduleDrawerHost } from "@/components/ai-tracking/AiScheduleDrawerHost";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { mutateAiTrackingAction as mutateAiTrackingActionCapacityAction } from "@/lib/actions/ai-tracking";
import { setDataSyncScheduleState } from "@/lib/actions/data-sync-schedule";
import type { TrackingScheduleList } from "@/lib/ai-tracking/projections/schedule-list";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { scheduleCostTotal } from "@/lib/schedules/cost-total";
import type { DataSyncKind, Schedule } from "@/lib/schedules/types";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { type AiSchedulesController, toAiScheduleListRow } from "./ai-schedule-rows";
import type { ScheduleEditorCandidate } from "./ScheduleEditorModel";
import { SchedulePlanningNotice } from "./SchedulePlanningNotice";
import { type ScheduleListRow, SchedulesList } from "./SchedulesList";
import { UnscheduledKeywordsNotice } from "./UnscheduledKeywordsNotice";

type SchedulesWorkspaceProps = {
  /** Null when AI tracking is unavailable to this actor; the rank list still renders. */
  ai: TrackingScheduleList | null;
  unifiedSchedules?: readonly Schedule[];
  /** `?ai=` target: an AI schedule public id or `new`. */
  aiTarget: string | null;
  aiUnavailable?: boolean;
  canManage: boolean;
  canUpdate: boolean;
  /** Data syncs whose switch this viewer may use; each needs its own control's permission. */
  canUpdateSyncs?: readonly DataSyncKind[];
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
  canUpdateSyncs = [],
  projectId,
  projectRef,
  schedules,
  unifiedSchedules,
  status,
  candidates = [],
  planningMinutes = null,
}: Readonly<SchedulesWorkspaceProps>) {
  const router = useRouter();
  const locale = useLocale();
  const total = unifiedSchedules ? scheduleCostTotal(unifiedSchedules) : null;
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
      {total ? (
        <p className="m-0 text-[12px] text-fg-muted">
          {t("unified.monthlyCost", {
            amount: new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
              total.cents / 100,
            ),
          })}
          {total.unknown > 0 ? ` · ${t("unified.unknownCosts", { count: total.unknown })}` : ""}
        </p>
      ) : null}
      <SchedulesList
        readOnlySchedules={unifiedSchedules?.filter(
          (row) => row.kind === "data_sync" || row.kind === "local_monitor",
        )}
        saveDataSyncState={saveDataSyncState}
        ai={controller}
        status={status}
        canManage={canManage}
        canUpdate={canUpdate}
        canUpdateSyncs={canUpdateSyncs}
        projectId={projectId}
        projectRef={projectRef}
        schedules={schedules}
      />
      {ai?.canWrite && aiTarget && status === "current" ? (
        <AiScheduleDrawerHost
          key={aiTarget}
          activePromptIds={ai.activePromptIds}
          engineDefault={ai.engineDefault}
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
