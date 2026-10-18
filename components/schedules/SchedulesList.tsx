"use client";

import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/toast-context";
import type { NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { AiArchiveScheduleModal } from "./AiArchiveScheduleModal";
import { ArchiveScheduleModal } from "./ArchiveScheduleModal";
import { type AiSchedulesController, aiScheduleHref } from "./ai-schedule-rows";
import { nextRunLabel } from "./schedule-next-run";
import {
  type AiSchedulesTableRow,
  type SchedulesTableRow,
  schedulesTableColumns,
} from "./schedules-table-columns";

type ScheduleFrequency = "custom_cron" | "daily" | "manual" | "monthly" | "paused" | "weekly";
export type ScheduleListRow = {
  archivedAt?: string | null;
  assignedKeywordCount?: number;
  blocked?: boolean;
  cronExpression?: string | null;
  dayOfMonth?: number | null;
  enabled: boolean;
  frequency: ScheduleFrequency;
  isDefault: boolean;
  jitterMinutes?: number;
  keywordCount: number;
  memberDeviceCount?: number;
  memberMarketCount?: number;
  name: string;
  nextRunAt?: string | null;
  perRunCents?: number | null;
  nativeEstimate?: NativeUsageEstimate;
  publicId: string;
  sharedTag?: string | null;
  targetCount?: number | null;
  timeOfDay?: string | null;
  timezone?: string | null;
  weekday?: string | null;
};

type SchedulesListProps = {
  /** AI schedules and their per-kind write rule; omitted when AI tracking is unavailable. */
  ai?: AiSchedulesController;
  canUpdate: boolean;
  canManage?: boolean;
  status?: "current" | "archived";
  projectId: string;
  projectRef: string;
  schedules: readonly ScheduleListRow[];
};

export function SchedulesList({
  ai,
  canUpdate,
  canManage = false,
  status = "current",
  projectId,
  projectRef,
  schedules,
}: Readonly<SchedulesListProps>) {
  const t = useTranslations("projectRuns.schedules");
  const usage = useNativeUsageFormat();
  const locale = useLocale();
  const router = useRouter();
  const [archiveTarget, setArchiveTarget] = useState<SchedulesTableRow | null>(null);
  const { showToast } = useToast();
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const rows = useMemo<readonly SchedulesTableRow[]>(
    () => [
      ...schedules.map((schedule) => ({
        ...schedule,
        scheduleKind: "rank" as const,
        id: `rank:${schedule.publicId}`,
        nextRunLabel: nextRunLabel(schedule.nextRunAt, schedule.timezone, locale, t),
      })),
      ...(ai?.rows ?? []).map((schedule) => ({
        ...schedule,
        scheduleKind: "ai" as const,
        id: `ai:${schedule.publicId}`,
        nextRunLabel: nextRunLabel(schedule.nextRunAt, schedule.timezone, locale, t),
      })),
    ],
    [ai?.rows, locale, schedules, t],
  );
  const aiCanWrite = ai?.canWrite ?? false;
  const aiHref = useCallback(
    (row: AiSchedulesTableRow) =>
      aiCanWrite && !row.archivedAt ? aiScheduleHref(projectRef, row.publicId) : null,
    [aiCanWrite, projectRef],
  );
  const openRow = useCallback(
    (row: SchedulesTableRow) => {
      if (row.scheduleKind === "rank") {
        router.push(projectSchedulesPath(projectRef, row.publicId));
        return;
      }
      const href = aiHref(row);
      if (href) router.push(href);
    },
    [aiHref, projectRef, router],
  );

  const togglePause = useCallback(
    async (row: SchedulesTableRow) => {
      if (row.scheduleKind === "ai") {
        // Only pausing is direct. Resuming re-enters review, preview and consent in the drawer.
        if (!ai || !row.enabled) return;
        setPendingScheduleId(row.id);
        try {
          await ai.onPause(row);
        } catch {
          showToast(t("list.toggleFailed"), { severity: "error" });
        } finally {
          setPendingScheduleId(null);
        }
        return;
      }
      const enabled = row.enabled;
      setPendingScheduleId(row.id);
      try {
        const response = await fetch(`/api/check-schedules/${row.publicId}`, {
          body: JSON.stringify({ enabled: !enabled, projectId }),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        if (!response.ok) {
          showToast(t("list.toggleFailed"), { severity: "error" });
          return;
        }
        router.refresh();
      } catch {
        showToast(t("list.toggleFailed"), { severity: "error" });
      } finally {
        setPendingScheduleId(null);
      }
    },
    [ai, projectId, router, showToast, t],
  );

  const columns = useMemo(
    () =>
      schedulesTableColumns({
        usage,
        aiCanWrite,
        aiHref,
        canUpdate,
        canManage,
        projectId,
        onArchive: setArchiveTarget,
        onOpenAi: openRow,
        onTogglePause: togglePause,
        pendingScheduleId,
        rankHref: (row) => projectSchedulesPath(projectRef, row.publicId),
        showKind: Boolean(ai),
        locale,
        t,
      }),
    [
      ai,
      aiCanWrite,
      aiHref,
      canUpdate,
      canManage,
      locale,
      openRow,
      projectId,
      pendingScheduleId,
      projectRef,
      t,
      togglePause,
      usage,
    ],
  );

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="sm">
      <section aria-labelledby="schedules-list-title">
        <TableCardHeader
          className={rows.length === 0 ? "border-b border-border" : undefined}
          titleId="schedules-list-title"
          title={t("scheduleCount", { count: rows.length })}
          actions={
            <>
              <MenuSelect
                ariaLabel={t("scheduleStatus")}
                leadingLabel={t("status")}
                value={status}
                options={[
                  { label: t("current"), value: "current" },
                  { label: t("archived"), value: "archived" },
                ]}
                onChange={(value) =>
                  router.push(
                    `${projectSchedulesPath(projectRef)}${value === "archived" ? "?status=archived" : ""}`,
                  )
                }
              />
              {canUpdate ? (
                <Button
                  href={projectSchedulesPath(projectRef, "new")}
                  size="sm"
                  variant="secondary"
                >
                  {t("newSchedule")}
                </Button>
              ) : null}
              {aiCanWrite ? (
                <Tooltip content={t("ai.addPromptFirst")} disabled={ai?.activePromptCount !== 0}>
                  <span
                    className="inline-flex"
                    tabIndex={ai?.activePromptCount === 0 ? 0 : undefined}
                  >
                    <Button
                      href={aiScheduleHref(projectRef, "new")}
                      disabled={ai?.activePromptCount === 0}
                      size="sm"
                      variant="secondary"
                    >
                      {t("ai.newSchedule")}
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </>
          }
        />
        {rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              compact
              icon={<CalendarBlank aria-hidden size={22} weight="regular" />}
              title={status === "archived" ? t("empty.archivedTitle") : t("empty.currentTitle")}
              description={
                status === "archived"
                  ? t("empty.archivedDescription")
                  : t("empty.currentDescription")
              }
            />
          </div>
        ) : (
          <div className="min-w-0">
            <DataTable
              bordered={false}
              ariaLabel={t("schedules")}
              columns={columns}
              id="schedules-list"
              layout="auto"
              onRowClick={openRow}
              onSortingChange={() => undefined}
              rows={rows}
              sorting={null}
            />
          </div>
        )}
        {archiveTarget?.scheduleKind === "rank" ? (
          <ArchiveScheduleModal
            key={archiveTarget.id}
            projectId={projectId}
            schedule={archiveTarget}
            schedules={schedules}
            onClose={() => setArchiveTarget(null)}
          />
        ) : null}
        {archiveTarget?.scheduleKind === "ai" && ai ? (
          <AiArchiveScheduleModal
            key={archiveTarget.id}
            schedule={archiveTarget}
            onArchive={ai.onArchive}
            onClose={() => setArchiveTarget(null)}
          />
        ) : null}
      </section>
    </Card>
  );
}
