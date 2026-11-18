import "server-only";
import type { TrackingScheduleListItem } from "@/lib/ai-tracking/projections/schedule-list";
import { listAiScheduleRows, listRankSchedules, projectAiSchedules } from "./checks";
import { listDataSyncSchedules } from "./data-syncs";
import { listLocalMonitorSchedules } from "./local-monitors";
import type { Schedule } from "./types";

export type ScheduleListOptions = {
  status?: "current" | "archived" | "all";
  now?: Date;
  /** A pre-authorized AI projection, or null when AI access is unavailable. */
  ai?: readonly TrackingScheduleListItem[] | null;
};

/** Internal read model. The caller authorizes project access before passing its internal id. */
export async function listSchedules(
  projectId: string,
  options: ScheduleListOptions = {},
): Promise<Schedule[]> {
  const now = options.now ?? new Date();
  if (options.status === "all") {
    const [current, archived] = await Promise.all([
      listSchedules(projectId, { ...options, status: "current" }),
      listSchedules(projectId, { ...options, status: "archived" }),
    ]);
    return [...current, ...archived];
  }
  const status = options.status ?? "current";
  const [rank, ai, local, syncs] = await Promise.all([
    listRankSchedules(projectId, status),
    (options.ai === undefined
      ? listAiScheduleRows(projectId, status)
      : Promise.resolve(options.ai ?? [])
    ).then((rows) =>
      projectAiSchedules(
        projectId,
        rows.filter((row) => Boolean(row.archivedAt) === (status === "archived")),
        now,
      ),
    ),
    listLocalMonitorSchedules(projectId, status, now),
    status === "archived" ? Promise.resolve([]) : listDataSyncSchedules(projectId, now),
  ]);
  return [...rank, ...ai, ...local, ...syncs];
}

export async function getSchedule(projectId: string, id: string): Promise<Schedule | null> {
  return (
    (await listSchedules(projectId, { status: "all" })).find((schedule) => schedule.id === id) ??
    null
  );
}
