import type { Schedule } from "@/lib/schedules/types";
import { ApiInputError } from "./errors";
import {
  dataSyncPublicId,
  isNativeSchedulePublicId,
  parseInternalDataSyncId,
} from "./schedule-public-id";

function publicScheduleId(schedule: Schedule) {
  if (schedule.kind === "data_sync") {
    const parsed = parseInternalDataSyncId(schedule.id);
    if (!parsed || parsed.kind !== schedule.sync_kind) {
      throw new ApiInputError("Expected a public schedule ID.", "invalid_public_id");
    }
    return dataSyncPublicId(parsed.projectPublicId, parsed.kind);
  }
  if (!isNativeSchedulePublicId(schedule.id)) {
    throw new ApiInputError("Expected a public schedule ID.", "invalid_public_id");
  }
  return schedule.id;
}

const syncKinds = {
  domain_rating: "domain_rating",
  search_console: "search_console_import",
  page_indexing: "page_indexing",
  sitemap: "sitemap_fetch",
} as const;

export function scheduleResource(schedule: Schedule) {
  return {
    id: publicScheduleId(schedule),
    kind: schedule.kind === "data_sync" ? syncKinds[schedule.sync_kind] : schedule.kind,
    group: schedule.group === "checks" ? "tracking" : schedule.group,
    actions: schedule.actions,
    name: schedule.name,
    state: schedule.state,
    state_reason: schedule.state_reason,
    last_run_at: schedule.last_run_at,
    last_run_status: schedule.last_run_state,
    cadence: {
      ...schedule.cadence,
      time_of_day: schedule.cadence.time_of_day ?? null,
      jitter_minutes: schedule.kind === "rank" ? schedule.rank.jitterMinutes : null,
    },
    target: schedule.target,
    settings: schedule.settings,
    next_run_at: schedule.next_run_at,
    monthly_cost_estimate_cents: schedule.monthly_cost_estimate_cents,
    target_summary: schedule.target_summary,
    limits: schedule.limits,
  };
}
