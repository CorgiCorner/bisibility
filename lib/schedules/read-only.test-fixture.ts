import type { DataSyncKind, DataSyncSchedule, LocalMonitorSchedule } from "./types";

export function dataSyncFixture(sync_kind: DataSyncKind): DataSyncSchedule {
  return {
    id: `sync:prj_one:${sync_kind}`,
    name: sync_kind,
    kind: "data_sync",
    sync_kind,
    group: "data_sync",
    actions: ["read"],
    state: "active",
    state_reason: null,
    cadence: {
      frequency: "custom_cron",
      cron_expression: {
        domain_rating: "0 * * * *",
        sitemap: "45 4 * * *",
        search_console: "40 12 * * *",
        page_indexing: "45 3 * * *",
      }[sync_kind],
      timezone: "UTC",
    },
    target: { type: "project", domain: "example.com" },
    target_summary: {},
    settings: {},
    limits: {},
    next_run_at: null,
    last_run_at: "2026-10-20T12:00:00.000Z",
    last_run_state: "snapshot_saved",
    monthly_cost_estimate_cents: null,
  };
}
export const localScheduleFixture: LocalMonitorSchedule = {
  ...dataSyncFixture("sitemap"),
  id: "lmon_one",
  name: "Local checks",
  kind: "local_monitor",
  group: "checks",
  state_reason: "approval_expired",
  target_summary: { monitors: 1 },
  monthly_cost_estimate_cents: 200,
};
export const readOnlyScheduleFixtures = [
  localScheduleFixture,
  ...(["domain_rating", "sitemap", "search_console", "page_indexing"] as const).map(
    dataSyncFixture,
  ),
];
