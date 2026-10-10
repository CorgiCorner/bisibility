"use client";

import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import { useToast } from "@/components/ui/toast-context";
import type { NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { ArchiveScheduleModal } from "./ArchiveScheduleModal";
import { type SchedulesTableRow, schedulesTableColumns } from "./schedules-table-columns";

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
  canUpdate: boolean;
  canManage?: boolean;
  status?: "current" | "archived";
  projectId: string;
  projectRef: string;
  schedules: readonly ScheduleListRow[];
};

function calendarDay(value: Date, locale: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";
  return Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")));
}

function nextRunLabel(
  value: string | null | undefined,
  timeZone: string | null | undefined,
  locale: string,
  t: ReturnType<typeof useTranslations<"projectRuns.schedules">>,
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const zone = timeZone ?? "UTC";
  const now = new Date();
  const days = Math.round(
    (calendarDay(date, locale, zone) - calendarDay(now, locale, zone)) / 86_400_000,
  );
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: zone,
  }).format(date);
  if (days === 0) return t("nextRun.today", { time });
  if (days === 1) return t("nextRun.tomorrow", { time });
  const day = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short" }).format(date);
  return t("nextRun.at", { day, time });
}

export function SchedulesList({
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
  const [archiveTarget, setArchiveTarget] = useState<ScheduleListRow | null>(null);
  const { showToast } = useToast();
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const rows = useMemo<readonly SchedulesTableRow[]>(
    () =>
      schedules.map((schedule) => ({
        ...schedule,
        id: schedule.publicId,
        nextRunLabel: nextRunLabel(schedule.nextRunAt, schedule.timezone, locale, t),
      })),
    [locale, schedules, t],
  );

  const togglePause = useCallback(
    async (row: SchedulesTableRow) => {
      const enabled = row.enabled;
      setPendingScheduleId(row.publicId);
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
    [projectId, router, showToast, t],
  );

  const columns = useMemo(
    () =>
      schedulesTableColumns({
        usage,
        canUpdate,
        canManage,
        projectId,
        onArchive: setArchiveTarget,
        onTogglePause: togglePause,
        pendingScheduleId,
        projectRef,
        locale,
        t,
      }),
    [canUpdate, canManage, locale, projectId, pendingScheduleId, projectRef, t, togglePause, usage],
  );

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="sm">
      <section aria-labelledby="schedules-list-title">
        <TableCardHeader
          className={schedules.length === 0 ? "border-b border-border" : undefined}
          titleId="schedules-list-title"
          title={t("scheduleCount", { count: schedules.length })}
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
            </>
          }
        />
        {schedules.length === 0 ? (
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
              onRowClick={(row) => router.push(projectSchedulesPath(projectRef, row.publicId))}
              onSortingChange={() => undefined}
              rows={rows}
              sorting={null}
            />
          </div>
        )}
        {archiveTarget ? (
          <ArchiveScheduleModal
            key={archiveTarget.publicId}
            projectId={projectId}
            schedule={archiveTarget}
            schedules={schedules}
            onClose={() => setArchiveTarget(null)}
          />
        ) : null}
      </section>
    </Card>
  );
}
