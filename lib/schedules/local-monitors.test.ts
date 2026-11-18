import { approval, calendar, policy } from "@/lib/local-monitor-recurring/recurring.test-fixture";
import { beforeEach, expect, it, vi } from "vitest";
import { listLocalMonitorSchedules } from "./local-monitors";

const mocks = vi.hoisted(() => ({
  monitors: vi.fn(),
  intents: vi.fn(),
  approvals: vi.fn(),
  cursors: vi.fn(),
  jobs: vi.fn(),
  connections: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    localMonitor: { findMany: mocks.monitors },
    localMonitorScheduleIntent: { findMany: mocks.intents },
    localMonitorRecurringApproval: { findMany: mocks.approvals },
    localMonitorRecurringCursor: { findMany: mocks.cursors },
    localMonitorLaunchIntent: { findMany: mocks.jobs },
    providerConnection: { findMany: mocks.connections },
  },
}));
const now = new Date("2026-10-20T12:00:00Z");
const monitor = {
  id: "monitor",
  publicId: "lmon_one",
  name: "Local checks",
  state: "active",
  currentScheduleIntentId: "intent",
};
const cursor = {
  approvalId: approval.id,
  nextDueAt: new Date("2026-10-21T12:00:00Z"),
  usedCents: "0",
  issuedOccurrences: 0,
  reason: null,
  state: "active",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LOCAL_MONITOR_RECURRING_ENABLED", "true");
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  mocks.connections.mockResolvedValue([
    {
      publicId: policy.connectionId,
      enabled: true,
      status: "connected",
      credentialSource: "own",
      credentialsEncrypted: "encrypted",
    },
  ]);
  mocks.monitors.mockResolvedValue([monitor]);
  mocks.intents.mockResolvedValue([{ id: "intent", mode: "scheduled", snapshot: calendar }]);
  mocks.approvals.mockResolvedValue([{ ...approval, scheduleIntentId: "intent" }]);
  mocks.cursors.mockResolvedValue([cursor]);
  mocks.jobs.mockResolvedValue([{ monitorId: monitor.id, createdAt: now, state: "completed" }]);
});
it("projects local intent and original approved cost without producing or materializing work", async () => {
  const [row] = await listLocalMonitorSchedules("project", "current", now);
  expect(row).toMatchObject({
    kind: "local_monitor",
    id: monitor.publicId,
    state: "active",
    state_reason: null,
    group: "checks",
    target_summary: { monitors: 1 },
    next_run_at: cursor.nextDueAt.toISOString(),
    last_run_at: now.toISOString(),
    last_run_state: "completed",
    limits: { maximum_total_cents: policy.maximumTotalCents },
    monthly_cost_estimate_cents: 1.8,
    actions: ["read"],
  });
  expect(mocks.approvals).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: "project", scheduleIntentId: { in: ["intent"] } },
    }),
  );
});
it.each(["expired", "missing"])(
  "explains %s approval while preserving active user intent",
  async (kind) => {
    if (kind === "missing") mocks.approvals.mockResolvedValue([]);
    const [row] = await listLocalMonitorSchedules(
      "project",
      "current",
      kind === "expired" ? new Date("2026-11-02T00:00:00Z") : now,
    );
    expect(row).toMatchObject({
      state: "active",
      state_reason: "approval_expired",
      next_run_at: null,
    });
  },
);
it.each([{ issuedOccurrences: 2 }, { usedCents: "0.07" }, { reason: "ceiling_exhausted" }])(
  "explains exhausted approval %j without changing intent",
  async (value) => {
    mocks.cursors.mockResolvedValue([{ ...cursor, ...value }]);
    expect((await listLocalMonitorSchedules("project", "current", now))[0]).toMatchObject({
      state: "active",
      state_reason: "limit_reached",
      next_run_at: null,
    });
  },
);
it.each(["flag", "driver"])("explains recurring_disabled for disabled %s", async (kind) => {
  vi.stubEnv(
    kind === "flag" ? "LOCAL_MONITOR_RECURRING_ENABLED" : "SCHEDULER_DRIVER",
    kind === "flag" ? "false" : "none",
  );
  expect((await listLocalMonitorSchedules("project", "current", now))[0]).toMatchObject({
    state: "active",
    state_reason: "recurring_disabled",
    next_run_at: null,
  });
});
it("reports a retained disconnected connection reason", async () => {
  mocks.cursors.mockResolvedValue([{ ...cursor, reason: "connection_unavailable" }]);
  expect((await listLocalMonitorSchedules("project", "current", now))[0].state_reason).toBe(
    "integration_disconnected",
  );
});
it.each(["paused", "manual"])("keeps %s intent paused", async (mode) => {
  mocks.intents.mockResolvedValue([{ id: "intent", mode, snapshot: null }]);
  expect((await listLocalMonitorSchedules("project", "current", now))[0]).toMatchObject({
    state: "paused",
    state_reason: null,
    next_run_at: null,
  });
});
it("keeps an archived intent out of the current query and lists it as archived", async () => {
  mocks.approvals.mockResolvedValue([]);
  mocks.intents.mockImplementation(async (args: { where?: { mode?: string; id?: unknown } }) =>
    args.where?.mode === "archived" || args.where?.id
      ? [{ id: "intent", mode: "archived", snapshot: null }]
      : [],
  );
  mocks.monitors.mockImplementation(
    async (args: {
      where?: {
        OR?: Array<{ currentScheduleIntentId?: { notIn?: string[] } | null }>;
        state?: unknown;
      };
    }) => {
      const excluded = args.where?.OR?.some((clause) =>
        clause.currentScheduleIntentId?.notIn?.includes("intent"),
      );
      if (excluded) return [];
      return args.where?.state === "archived" ? [] : [monitor];
    },
  );
  expect(await listLocalMonitorSchedules("project", "current", now)).toEqual([]);
  expect(mocks.monitors).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        OR: [{ currentScheduleIntentId: null }, { currentScheduleIntentId: { notIn: ["intent"] } }],
        projectId: "project",
        state: { not: "archived" },
      },
    }),
  );
  expect((await listLocalMonitorSchedules("project", "archived", now))[0]).toMatchObject({
    state: "archived",
    next_run_at: null,
  });
  expect(mocks.monitors).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        projectId: "project",
        state: { not: "archived" },
        currentScheduleIntentId: { in: ["intent"] },
      },
    }),
  );
});
it("lists a restored paused intent as paused", async () => {
  mocks.intents.mockResolvedValue([{ id: "intent", mode: "paused", snapshot: null }]);
  mocks.approvals.mockResolvedValue([]);
  expect((await listLocalMonitorSchedules("project", "current", now))[0]).toMatchObject({
    state: "paused",
    state_reason: null,
    next_run_at: null,
  });
});
it("reads archived monitors separately", async () => {
  mocks.monitors.mockResolvedValue([{ ...monitor, state: "archived" }]);
  expect((await listLocalMonitorSchedules("project", "archived", now))[0]).toMatchObject({
    state: "archived",
    next_run_at: null,
  });
  expect(mocks.monitors).toHaveBeenCalledWith(
    expect.objectContaining({ where: { projectId: "project", state: "archived" } }),
  );
});

it.each([
  { enabled: false },
  { status: "needs_reauth" },
  { credentialsEncrypted: null },
  { credentialSource: "hosted" },
])("reads current connection availability %j", async (change) => {
  mocks.connections.mockResolvedValue([
    {
      publicId: policy.connectionId,
      enabled: true,
      status: "connected",
      credentialSource: "own",
      credentialsEncrypted: "encrypted",
      ...change,
    },
  ]);
  expect((await listLocalMonitorSchedules("project", "current", now))[0]).toMatchObject({
    state: "active",
    state_reason: "integration_disconnected",
    next_run_at: null,
  });
});
it("does not advertise a blocked cursor's retained due time as a future run", async () => {
  mocks.cursors.mockResolvedValue([{ ...cursor, state: "blocked", reason: "source_changed" }]);
  expect((await listLocalMonitorSchedules("project", "current", now))[0].next_run_at).toBeNull();
});
