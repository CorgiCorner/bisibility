import { beforeEach, expect, it, vi } from "vitest";
import { ScheduleTransitionError } from "./errors";
import { setScheduleState } from "./mutations";
import { WEB_UNGATED_REVIEW } from "./review-commit";

const mocks = vi.hoisted(() => ({
  archiveMonitor: vi.fn(),
  deleteJobs: vi.fn(),
  deleteRevision: vi.fn(),
  intent: vi.fn(),
  local: vi.fn(),
  pause: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./local-monitors", () => ({ listLocalMonitorSchedules: mocks.local }));
vi.mock("@/lib/local-monitor-recurring/service", () => ({
  pauseRecurringFor: mocks.pause,
  restoreRecurringFor: mocks.restore,
}));
vi.mock("@/lib/local-monitor-store/schedule", () => ({
  setLocalMonitorScheduleIntent: mocks.intent,
}));
vi.mock("@/lib/local-monitor-store/write", () => ({ archiveLocalMonitor: mocks.archiveMonitor }));

const actor = { id: "user_1", memberships: [] };
const monitorId = "lmn_a00000000000000000000000";
const command = {
  expectedVersion: 3,
  idempotencyKey: "local-1",
  monitorId,
  projectId: "prj_a00000000000000000000000",
};
const paused = {
  id: monitorId,
  kind: "local_monitor" as const,
  state: "paused" as const,
  state_reason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.local.mockResolvedValue([paused]);
});

it("reports approval_expired and writes nothing for a paused or manual monitor", async () => {
  await expect(
    setScheduleState(
      "project",
      actor,
      monitorId,
      "active",
      { kind: "local_monitor" },
      WEB_UNGATED_REVIEW,
    ),
  ).resolves.toMatchObject({ state: "paused", state_reason: "approval_expired" });
  expect(mocks.intent).not.toHaveBeenCalled();
  expect(mocks.pause).not.toHaveBeenCalled();
  expect(mocks.restore).not.toHaveBeenCalled();
});

it("returns an active monitor unchanged", async () => {
  const active = { ...paused, state: "active" as const, state_reason: "approval_expired" as const };
  mocks.local.mockResolvedValue([active]);
  await expect(
    setScheduleState(
      "project",
      actor,
      monitorId,
      "active",
      { kind: "local_monitor" },
      WEB_UNGATED_REVIEW,
    ),
  ).resolves.toEqual(active);
  expect(mocks.intent).not.toHaveBeenCalled();
});

it("does not write when an archived monitor is archived again", async () => {
  const archived = { ...paused, state: "archived" as const };
  mocks.local.mockResolvedValue([archived]);
  await expect(
    setScheduleState(
      "project",
      actor,
      monitorId,
      "archived",
      {
        kind: "local_monitor",
        local: command,
        projectPublicId: command.projectId,
      },
      WEB_UNGATED_REVIEW,
    ),
  ).resolves.toEqual(archived);
  expect(mocks.intent).not.toHaveBeenCalled();
  expect(mocks.pause).not.toHaveBeenCalled();
});

it("archives the schedule intent and keeps the monitor definition and results", async () => {
  await setScheduleState(
    "project",
    actor,
    monitorId,
    "archived",
    {
      kind: "local_monitor",
      local: command,
      projectPublicId: command.projectId,
    },
    WEB_UNGATED_REVIEW,
  );
  expect(mocks.intent).toHaveBeenCalledWith(
    expect.objectContaining({
      consentToken: null,
      expectedScheduleEpoch: null,
      mode: "archived",
      monitorId,
      scheduleId: null,
    }),
    { actor },
    expect.anything(),
  );
  expect(mocks.archiveMonitor).not.toHaveBeenCalled();
  expect(mocks.deleteRevision).not.toHaveBeenCalled();
  expect(mocks.deleteJobs).not.toHaveBeenCalled();
});

it("does not restore an archived monitor when pause omits the restore flag", async () => {
  mocks.local.mockResolvedValue([{ ...paused, state: "archived" }]);
  await expect(
    setScheduleState(
      "project",
      actor,
      monitorId,
      "paused",
      {
        kind: "local_monitor",
        local: command,
        projectPublicId: command.projectId,
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toBeInstanceOf(ScheduleTransitionError);
  expect(mocks.pause).not.toHaveBeenCalled();
  expect(mocks.intent).not.toHaveBeenCalled();
});

it("restores a monitor the list marks archived back to the existing pause", async () => {
  mocks.local.mockResolvedValue([{ ...paused, state: "archived" }]);
  await setScheduleState(
    "project",
    actor,
    monitorId,
    "paused",
    {
      kind: "local_monitor",
      local: command,
      projectPublicId: command.projectId,
      restore: true,
    },
    WEB_UNGATED_REVIEW,
  );
  expect(mocks.restore).toHaveBeenCalledWith(command, { actor });
  expect(mocks.pause).not.toHaveBeenCalled();
  expect(mocks.intent).not.toHaveBeenCalled();
});

it("does not write when restore is requested for a monitor that is not archived", async () => {
  await expect(
    setScheduleState(
      "project",
      actor,
      monitorId,
      "paused",
      {
        kind: "local_monitor",
        local: command,
        projectPublicId: command.projectId,
        restore: true,
      },
      WEB_UNGATED_REVIEW,
    ),
  ).resolves.toEqual(paused);
  expect(mocks.restore).not.toHaveBeenCalled();
  expect(mocks.pause).not.toHaveBeenCalled();
  expect(mocks.intent).not.toHaveBeenCalled();
});

it("refuses a local command whose project id is not the authorized project", async () => {
  await expect(
    setScheduleState(
      "project",
      actor,
      monitorId,
      "paused",
      {
        kind: "local_monitor",
        local: command,
        projectPublicId: `prj_${"c".repeat(24)}`,
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toMatchObject({ code: "schedule_project_required" });
  expect(mocks.pause).not.toHaveBeenCalled();
});

it("refuses to activate an archived local monitor", async () => {
  mocks.local.mockResolvedValue([{ ...paused, state: "archived" }]);
  await expect(
    setScheduleState(
      "project",
      actor,
      monitorId,
      "active",
      {
        kind: "local_monitor",
        local: command,
        projectPublicId: command.projectId,
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toBeInstanceOf(ScheduleTransitionError);
  expect(mocks.intent).not.toHaveBeenCalled();
  expect(mocks.pause).not.toHaveBeenCalled();
});

it("runs local recurring pause on the receipt transaction and rejects unsuccessful writes", async () => {
  const { setScheduleStateNow } = await import("./mutation-runs");
  const tx = { $queryRaw: vi.fn() } as never;
  mocks.pause.mockResolvedValueOnce({ kind: "conflict" });
  await expect(
    setScheduleStateNow(
      "project",
      actor,
      monitorId,
      "paused",
      { kind: "local_monitor", local: command, projectPublicId: command.projectId },
      tx,
    ),
  ).rejects.toMatchObject({ code: "schedule_local_conflict" });
  expect(mocks.pause).toHaveBeenCalledWith(command, { actor }, tx);
});
