import type { TrackingScheduleListItem } from "@/lib/ai-tracking/projections/schedule-list";
import type { listCheckScheduleRows } from "@/lib/queries/check-schedule-list";

export type ScheduleState = "active" | "paused" | "archived";
export type ScheduleStateReason =
  | "approval_expired"
  | "limit_reached"
  | "recurring_disabled"
  | "instance_disabled"
  | "integration_disconnected"
  | "inspection_budget_off";
export type DataSyncKind = "domain_rating" | "sitemap" | "search_console" | "page_indexing";
export type ScheduleCadence = {
  frequency: string;
  cron_expression: string | null;
  timezone: string;
  time_of_day?: string | null;
};
type ScheduleFields = {
  id: string;
  name: string;
  group: "checks" | "data_sync";
  actions: readonly ["read"];
  state: ScheduleState;
  state_reason: ScheduleStateReason | null;
  cadence: ScheduleCadence;
  target: { type: string; ids?: readonly string[]; domain?: string | null };
  settings: { [key: string]: string | number | boolean | null };
  limits: { [key: string]: string | number | null };
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_state: string | null;
  target_summary: { keywords?: number; prompts?: number; monitors?: number; targets?: number };
  monthly_cost_estimate_cents: number | null;
};
export type RankScheduleRow = Awaited<ReturnType<typeof listCheckScheduleRows>>[number];
export type RankSchedule = ScheduleFields & { kind: "rank"; rank: RankScheduleRow };
export type AiSchedule = ScheduleFields & { kind: "ai"; ai: TrackingScheduleListItem };
export type LocalMonitorSchedule = ScheduleFields & { kind: "local_monitor" };
export type DataSyncSchedule = ScheduleFields & { kind: "data_sync"; sync_kind: DataSyncKind };
export type Schedule = RankSchedule | AiSchedule | LocalMonitorSchedule | DataSyncSchedule;

export function scheduleState(enabled: boolean, archivedAt?: string | Date | null): ScheduleState {
  return archivedAt ? "archived" : enabled ? "active" : "paused";
}
