"use client";

import {
  Button,
  Card,
  EmptyState,
  PillBadge,
  tableHeaderClassName,
  useToast,
} from "@/components/ui";
import { rankTrackerSchedulesPath } from "@/lib/routing/rank-tracker-schedules-path";
import { scheduleCadenceLabel } from "@/lib/schedules/cadence-label";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ScheduleFrequency = "custom_cron" | "daily" | "manual" | "monthly" | "paused" | "weekly";
type ScheduleState = "blocked" | "paused";

export type ScheduleListRow = {
  blocked?: boolean;
  cadenceLabel?: string;
  cadenceMeta?: string;
  cronExpression?: string | null;
  dayOfMonth?: string | null;
  enabled: boolean;
  frequency: ScheduleFrequency;
  isDefault: boolean;
  keywordCount: number;
  memberMeta?: string;
  name: string;
  nextRunLabel?: string | null;
  perRunCents?: number | null;
  publicId: string;
  tagScope?: string | null;
  targetCount?: number | null;
  timeOfDay?: string | null;
  timezone?: string | null;
  weekday?: string | null;
};

type SchedulesListProps = {
  canUpdate: boolean;
  projectId: string;
  projectRef: string;
  schedules: readonly ScheduleListRow[];
};

// Keep the labels and tones for exceptional schedule states in this one closed mapping.
const scheduleStateMeta = {
  blocked: { label: "Next run blocked - monthly limit", tone: "text-fg-muted" },
  paused: { label: "Paused", tone: "text-fg-muted" },
} satisfies Record<ScheduleState, { label: string; tone: string }>;

function stateFor(row: ScheduleListRow, enabled: boolean): ScheduleState | null {
  if (!enabled || row.frequency === "paused") return "paused";
  return row.blocked ? "blocked" : null;
}

function memberLabel(row: ScheduleListRow) {
  if (row.targetCount === null || row.targetCount === undefined) {
    return `${row.keywordCount.toLocaleString("en-US")} keywords`;
  }
  const scope = row.memberMeta ? ` in ${row.memberMeta}` : "";
  return `${row.keywordCount.toLocaleString("en-US")} keywords${scope} = ${row.targetCount.toLocaleString("en-US")} checks a run`;
}

function perRunLabel(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "-";
  return `~${new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100)}`;
}

function pauseTitle(enabled: boolean) {
  return enabled
    ? "Stops all future runs of this schedule. To skip only the next one, use Skip once in Runs > Planned."
    : "Resumes the cadence. The next run is scheduled from now, not backfilled.";
}

export function SchedulesList({
  canUpdate,
  projectId,
  projectRef,
  schedules,
}: Readonly<SchedulesListProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);

  if (schedules.length === 0) {
    return (
      <Card className="min-w-0 overflow-hidden p-0" size="sm">
        <section aria-label="Schedules">
          <EmptyState
            action={
              <Button
                href={rankTrackerSchedulesPath(projectRef, "new")}
                size="sm"
                variant="secondary"
              >
                New schedule
              </Button>
            }
            compact
            description="Keywords are checked only when you launch a run. Create a schedule to check them on a cadence."
            icon={<CalendarBlank aria-hidden size={22} weight="regular" />}
            title="No schedules yet"
          />
        </section>
      </Card>
    );
  }

  async function togglePause(row: ScheduleListRow) {
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
        showToast("Could not update the schedule. Please try again.", { severity: "error" });
        return;
      }
      router.refresh();
    } catch {
      showToast("Could not update the schedule. Please try again.", { severity: "error" });
    } finally {
      setPendingScheduleId(null);
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="sm">
      <section aria-labelledby="schedules-list-title">
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
          <span className="text-[15px] font-semibold text-fg" id="schedules-list-title">
            {schedules.length} {schedules.length === 1 ? "schedule" : "schedules"}
          </span>
          <Button href={rankTrackerSchedulesPath(projectRef, "new")} size="sm" variant="secondary">
            New schedule
          </Button>
        </header>
        <div className="overflow-x-auto">
          <table
            aria-label="Schedules"
            className="w-full min-w-[940px] table-fixed border-collapse"
          >
            <thead className={`text-left ${tableHeaderClassName}`}>
              <tr>
                <th className="w-[250px] px-4 py-2.5 font-semibold" scope="col">
                  Schedule
                </th>
                <th className="w-[190px] px-4 py-2.5 font-semibold" scope="col">
                  Cadence
                </th>
                <th className="px-4 py-2.5 font-semibold" scope="col">
                  Members
                </th>
                <th className="w-[120px] px-4 py-2.5 font-semibold" scope="col">
                  Per run
                </th>
                <th className="w-[150px] px-4 py-2.5 font-semibold" scope="col">
                  Next
                </th>
                <th className="w-[130px] px-4 py-2.5 font-semibold" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schedules.map((row) => {
                const enabled = row.enabled;
                const state = stateFor(row, enabled);
                const pauseLabel = enabled ? "Pause" : "Resume";
                return (
                  <tr
                    className="cursor-pointer text-[12px] hover:bg-bg-sunken/55"
                    key={row.publicId}
                    onClick={() => router.push(rankTrackerSchedulesPath(projectRef, row.publicId))}
                  >
                    <td className="min-w-0 px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          className="text-[12.5px] font-semibold text-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                          href={rankTrackerSchedulesPath(projectRef, row.publicId)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.name}
                        </Link>
                        {row.isDefault ? (
                          <PillBadge
                            size="xs"
                            title="New keywords join this schedule unless you pick another one."
                          >
                            Default
                          </PillBadge>
                        ) : null}
                      </div>
                      {state ? (
                        <span
                          className={`mt-0.5 block text-[11px] ${scheduleStateMeta[state].tone}`}
                        >
                          {scheduleStateMeta[state].label}
                        </span>
                      ) : null}
                    </td>
                    <td className="min-w-0 px-4 py-3 align-top">
                      <span className="block leading-[1.45] text-fg">
                        {row.cadenceLabel ?? scheduleCadenceLabel(row)}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
                        {row.cadenceMeta ?? row.timezone ?? "Uses project time zone"}
                      </span>
                    </td>
                    <td className="min-w-0 px-4 py-3 align-top">
                      <span className="block leading-[1.45] text-fg">{memberLabel(row)}</span>
                      {row.tagScope ? (
                        <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
                          {row.tagScope}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="block font-sans text-[12px] font-semibold tabular-nums text-fg">
                        {perRunLabel(row.perRunCents)}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-fg-muted">per run</span>
                    </td>
                    <td
                      className={`px-4 py-3 align-top text-[11px] ${state ? "text-fg-muted" : "text-fg"}`}
                    >
                      {enabled ? (row.nextRunLabel ?? "-") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {canUpdate ? (
                        <Button
                          aria-label={`${pauseLabel} ${row.name}`}
                          disabled={pendingScheduleId === row.publicId}
                          onClick={(event) => {
                            event.stopPropagation();
                            void togglePause(row);
                          }}
                          size="xs"
                          title={pauseTitle(enabled)}
                          variant="secondary"
                        >
                          {pauseLabel}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </Card>
  );
}
