import { beforeEach, expect, it, vi } from "vitest";
import { dataSyncStateReason, listDataSyncSchedules } from "./data-syncs";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  credentials: vi.fn(),
  gsc: vi.fn(),
  rating: vi.fn(),
  sitemap: vi.fn(),
  indexing: vi.fn(),
  imported: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.project },
    domainRatingCheck: { findFirst: mocks.rating },
    sitemapSnapshot: { findFirst: mocks.sitemap },
    pageIndexingDay: { findFirst: mocks.indexing },
    searchAnalyticsImport: { findUnique: mocks.imported, findFirst: mocks.imported },
  },
}));
vi.mock("@/lib/domain-rating/credentials", () => ({
  resolveDomainRatingCredentials: mocks.credentials,
}));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  readSearchInsightsConnection: mocks.gsc,
}));
const now = new Date("2026-10-20T12:00:00Z");
const project = {
  publicId: "prj_one",
  domain: "example.com",
  syncPauses: [] as { kind: string }[],
  defaults: { inspectionBudgetMode: "fixed", inspectionDailyLimit: 10 } as {
    inspectionBudgetMode?: string | null;
    inspectionDailyLimit?: number;
  } | null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITEMAP_SYNC_ENABLED", "true");
  vi.stubEnv("PRESENCE_SYNC_ENABLED", "true");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "true");
  vi.stubEnv("SITEMAP_SYNC_CRON", "");
  vi.stubEnv("PRESENCE_SYNC_CRON", "");
  mocks.project.mockResolvedValue(project);
  mocks.credentials.mockResolvedValue({ source: "own" });
  mocks.gsc.mockResolvedValue({ connection: { property: "sc-domain:example.com" }, problem: null });
  mocks.rating.mockResolvedValue({ createdAt: now, completedAt: now, error: null });
  mocks.sitemap.mockResolvedValue({ fetchedAt: now });
  mocks.indexing.mockResolvedValue({ recordedAt: now, failed: 0, stop: null });
  mocks.imported.mockResolvedValue({
    lastSyncFinishedAt: now,
    state: "completed",
    pausedReason: null,
  });
});
it("lists every free sync with deterministic project-scoped ids and retained last evidence", async () => {
  const rows = await listDataSyncSchedules("project", now);
  expect(rows.map((row) => row.sync_kind)).toEqual([
    "domain_rating",
    "sitemap",
    "search_console",
    "page_indexing",
  ]);
  expect(rows.map((row) => row.id)).toEqual(rows.map((row) => `sync:prj_one:${row.sync_kind}`));
  expect(rows.map((row) => row.cadence.cron_expression)).toEqual([
    "0 * * * *",
    "45 4 * * *",
    "40 12 * * *",
    "45 3 * * *",
  ]);
  for (const row of rows)
    expect(row).toMatchObject({
      kind: "data_sync",
      group: "data_sync",
      state: "active",
      state_reason: null,
      last_run_at: now.toISOString(),
      monthly_cost_estimate_cents: null,
      actions: ["read"],
    });
  expect(mocks.imported).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        projectId_property_source: {
          projectId: "project",
          property: "sc-domain:example.com",
          source: "gsc",
        },
      },
    }),
  );
});
it("preserves per-project opt-outs", async () => {
  // Domain rating and sitemap opt-outs live in pause rows after the data migration. The
  // property-level import pause and an inspection budget of off keep their base meaning.
  mocks.project.mockResolvedValue({
    ...project,
    syncPauses: [{ kind: "domain_rating" }, { kind: "sitemap_fetch" }],
    defaults: { inspectionBudgetMode: "off" },
  });
  mocks.imported.mockResolvedValue({ state: "paused", pausedReason: "user" });
  const rows = await listDataSyncSchedules("project", now);
  expect(rows.map(({ state, state_reason }) => [state, state_reason])).toEqual([
    ["paused", null],
    ["paused", null],
    ["paused", null],
    ["paused", "inspection_budget_off"],
  ]);
});
it.each([
  { pauseRow: false, importPause: null, state: "active" },
  { pauseRow: true, importPause: null, state: "paused" },
  { pauseRow: false, importPause: "user", state: "paused" },
  { pauseRow: true, importPause: "user", state: "paused" },
  { pauseRow: false, importPause: "error", state: "active" },
])(
  "derives Search Console from the pause row ($pauseRow) and the import pause ($importPause)",
  async ({ pauseRow, importPause, state }) => {
    mocks.project.mockResolvedValue({
      ...project,
      syncPauses: pauseRow ? [{ kind: "search_console_import" }] : [],
    });
    mocks.imported.mockResolvedValue({
      lastSyncFinishedAt: now,
      state: importPause ? "paused" : "completed",
      pausedReason: importPause,
    });
    const row = (await listDataSyncSchedules("project", now)).find(
      (item) => item.sync_kind === "search_console",
    );
    expect(row).toMatchObject({ state, state_reason: null });
  },
);
it.each([
  { pauseRow: false, defaults: null, state: "active", reason: null },
  {
    pauseRow: false,
    defaults: { inspectionBudgetMode: "fixed", inspectionDailyLimit: 10 },
    state: "active",
    reason: null,
  },
  {
    pauseRow: false,
    defaults: { inspectionBudgetMode: "available_quota", inspectionDailyLimit: 0 },
    state: "active",
    reason: null,
  },
  {
    pauseRow: true,
    defaults: { inspectionBudgetMode: "fixed", inspectionDailyLimit: 10 },
    state: "paused",
    reason: null,
  },
  {
    pauseRow: false,
    defaults: { inspectionBudgetMode: "off", inspectionDailyLimit: 10 },
    state: "paused",
    reason: "inspection_budget_off",
  },
  {
    pauseRow: false,
    defaults: { inspectionBudgetMode: "fixed", inspectionDailyLimit: 0 },
    state: "paused",
    reason: "inspection_budget_off",
  },
  {
    pauseRow: true,
    defaults: { inspectionBudgetMode: "off", inspectionDailyLimit: 10 },
    state: "paused",
    reason: "inspection_budget_off",
  },
])(
  "derives Page indexing from the pause row ($pauseRow) and the budget $defaults",
  async ({ pauseRow, defaults, state, reason }) => {
    mocks.project.mockResolvedValue({
      ...project,
      syncPauses: pauseRow ? [{ kind: "page_indexing" }] : [],
      defaults,
    });
    const row = (await listDataSyncSchedules("project", now)).find(
      (item) => item.sync_kind === "page_indexing",
    );
    expect(row).toMatchObject({ state, state_reason: reason });
  },
);
it("reports instance_disabled without replacing project intent", async () => {
  vi.stubEnv("SITEMAP_SYNC_ENABLED", "false");
  vi.stubEnv("PRESENCE_SYNC_ENABLED", "false");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "false");
  const rows = await listDataSyncSchedules("project", now);
  for (const row of rows.slice(1))
    expect(row).toMatchObject({ state: "active", state_reason: "instance_disabled" });
});
it.each(["missing", "disabled", "needs_reauth", "unreadable"])(
  "projects %s GSC and unavailable rating as integration_disconnected",
  async (problem) => {
    mocks.gsc.mockResolvedValue({ connection: null, problem });
    mocks.credentials.mockResolvedValue(null);
    const rows = await listDataSyncSchedules("project", now);
    for (const row of rows.filter((row) => row.sync_kind !== "sitemap"))
      expect(row).toMatchObject({ state: "active", state_reason: "integration_disconnected" });
    expect(rows.find((row) => row.sync_kind === "sitemap")?.state_reason).toBeNull();
  },
);
it("does not invent executions for a project without retained evidence", async () => {
  for (const mock of [mocks.rating, mocks.sitemap, mocks.indexing, mocks.imported])
    mock.mockResolvedValue(null);
  for (const row of await listDataSyncSchedules("project", now))
    expect(row).toMatchObject({ last_run_at: null, last_run_state: null, next_run_at: null });
});
it("retains the last GSC evidence after its integration disconnects", async () => {
  mocks.gsc.mockResolvedValue({ connection: null, problem: "disabled" });
  const row = (await listDataSyncSchedules("project", now)).find(
    (item) => item.sync_kind === "search_console",
  );
  expect(row).toMatchObject({
    state_reason: "integration_disconnected",
    last_run_at: now.toISOString(),
    last_run_state: "completed",
  });
});

it("reports disconnection and restores each project's saved intent on reconnect", async () => {
  mocks.project.mockResolvedValue({
    ...project,
    syncPauses: [{ kind: "domain_rating" }, { kind: "search_console_import" }],
  });
  mocks.credentials.mockResolvedValue(null);
  mocks.gsc.mockResolvedValue({ connection: null, problem: "disabled" });
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "false");
  const disconnected = await listDataSyncSchedules("project", now);
  expect(disconnected.map(({ state, state_reason }) => [state, state_reason])).toEqual([
    ["paused", "integration_disconnected"],
    ["active", null],
    // Disabled on the instance and disconnected: the instance switch is reported first.
    ["paused", "instance_disabled"],
    ["active", "integration_disconnected"],
  ]);

  mocks.credentials.mockResolvedValue({ source: "own" });
  mocks.gsc.mockResolvedValue({ connection: { property: "sc-domain:example.org" }, problem: null });
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "true");
  const reconnected = await listDataSyncSchedules("project", now);
  expect(reconnected.map(({ state, state_reason }) => [state, state_reason])).toEqual([
    ["paused", null],
    ["active", null],
    ["paused", null],
    ["active", null],
  ]);
});

it.each([
  {
    instance: false,
    connected: false,
    external: { reason: "inspection_budget_off" },
    reason: "instance_disabled",
  },
  {
    instance: true,
    connected: false,
    external: { reason: "inspection_budget_off" },
    reason: "integration_disconnected",
  },
  {
    instance: true,
    connected: true,
    external: { reason: "inspection_budget_off" },
    reason: "inspection_budget_off",
  },
  { instance: false, connected: true, external: null, reason: "instance_disabled" },
  { instance: true, connected: true, external: { reason: null }, reason: null },
] as const)(
  "reports the widest blocker first: instance $instance, connected $connected -> $reason",
  ({ reason, ...blockers }) => {
    expect(dataSyncStateReason(blockers)).toBe(reason);
  },
);
it("reports instance_disabled before a disconnected integration and before the budget", async () => {
  vi.stubEnv("PRESENCE_SYNC_ENABLED", "false");
  mocks.gsc.mockResolvedValue({ connection: null, problem: "disabled" });
  mocks.project.mockResolvedValue({ ...project, defaults: { inspectionBudgetMode: "off" } });
  const row = (await listDataSyncSchedules("project", now)).find(
    (item) => item.sync_kind === "page_indexing",
  );
  expect(row).toMatchObject({ state: "paused", state_reason: "instance_disabled" });
});
