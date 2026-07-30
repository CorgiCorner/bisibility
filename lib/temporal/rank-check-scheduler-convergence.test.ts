import {
  ScheduleAlreadyRunning,
  type ScheduleDescription,
  type ScheduleHandle,
  ScheduleNotFoundError,
} from "@temporalio/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { RECONCILER_SCHEDULE_ID } from "./bootstrap";
import {
  convergeRankCheckSchedulerSingletons,
  type RankCheckSchedulerConvergenceClient,
} from "./rank-check-scheduler-convergence";

vi.mock("server-only", () => ({}));

type MockSchedule = {
  paused: boolean;
  workflowType: string;
};

function scheduleDescription(scheduleId: string, schedule: MockSchedule) {
  return {
    action: {
      type: "startWorkflow",
      workflowId: scheduleId,
      workflowType: schedule.workflowType,
    },
    policies: { catchupWindow: 3_600_000, overlap: "SKIP", pauseOnFailure: false },
    scheduleId,
    spec: { intervals: [{ every: 60_000, offset: 0 }] },
    state: { paused: schedule.paused },
  } as unknown as ScheduleDescription;
}

function clientMock(initial: Record<string, MockSchedule>) {
  const schedules = new Map(Object.entries(initial));
  const events: string[] = [];
  const getHandle = vi.fn((scheduleId: string) => {
    const handle = {
      describe: vi.fn(async () => {
        const schedule = schedules.get(scheduleId);
        if (!schedule) throw new ScheduleNotFoundError("missing", scheduleId);
        return scheduleDescription(scheduleId, schedule);
      }),
      pause: vi.fn(async () => {
        const schedule = schedules.get(scheduleId);
        if (!schedule) throw new ScheduleNotFoundError("missing", scheduleId);
        events.push(`pause:${scheduleId}`);
        schedule.paused = true;
      }),
      update: vi.fn(async (updater: (value: ScheduleDescription) => ScheduleDescription) => {
        const schedule = schedules.get(scheduleId);
        if (!schedule) throw new ScheduleNotFoundError("missing", scheduleId);
        events.push(`update:${scheduleId}`);
        const updated = updater(scheduleDescription(scheduleId, schedule));
        schedule.paused = updated.state.paused;
      }),
    };
    return handle as unknown as ScheduleHandle;
  });
  const create = vi.fn(
    async (options: { action: { workflowType: string }; scheduleId: string }) => {
      events.push(`create:${options.scheduleId}`);
      if (schedules.has(options.scheduleId)) {
        throw new ScheduleAlreadyRunning("exists", options.scheduleId);
      }
      schedules.set(options.scheduleId, {
        paused: false,
        workflowType: options.action.workflowType,
      });
      return getHandle(options.scheduleId);
    },
  );
  return {
    client: { create, getHandle } as unknown as RankCheckSchedulerConvergenceClient,
    events,
    schedules,
  };
}

describe("rank-check singleton convergence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["legacy", RECONCILER_SCHEDULE_ID, RANK_CHECK_DISPATCHER_SCHEDULE_ID],
    ["dispatcher", RANK_CHECK_DISPATCHER_SCHEDULE_ID, RECONCILER_SCHEDULE_ID],
  ] as const)("keeps only the %s singleton active", async (mode, selected, retired) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
    const { client, events, schedules } = clientMock({
      [RANK_CHECK_DISPATCHER_SCHEDULE_ID]: {
        paused: false,
        workflowType: "dispatchDueRankChecksWorkflow",
      },
      [RECONCILER_SCHEDULE_ID]: {
        paused: false,
        workflowType: "reconcileRankCheckSchedulesWorkflow",
      },
      "maintenance-audit-purge": { paused: false, workflowType: "purgeAuditLogsWorkflow" },
    });

    await expect(convergeRankCheckSchedulerSingletons(client)).resolves.toMatchObject({ mode });
    expect(schedules.get(selected)?.paused).toBe(false);
    expect(schedules.get(retired)?.paused).toBe(true);
    expect(schedules.get("maintenance-audit-purge")?.paused).toBe(false);
    expect(events[0]).toBe(`pause:${retired}`);
  });

  it("pauses both automatic rank-check singletons in cutover", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    const { client, schedules } = clientMock({
      [RANK_CHECK_DISPATCHER_SCHEDULE_ID]: {
        paused: false,
        workflowType: "dispatchDueRankChecksWorkflow",
      },
      [RECONCILER_SCHEDULE_ID]: {
        paused: false,
        workflowType: "reconcileRankCheckSchedulesWorkflow",
      },
    });

    await expect(convergeRankCheckSchedulerSingletons(client)).resolves.toMatchObject({
      mode: "cutover",
    });
    expect(schedules.get(RANK_CHECK_DISPATCHER_SCHEDULE_ID)?.paused).toBe(true);
    expect(schedules.get(RECONCILER_SCHEDULE_ID)?.paused).toBe(true);
  });

  it("is idempotent and unpauses the selected singleton after rollback", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
    const { client, schedules } = clientMock({
      [RECONCILER_SCHEDULE_ID]: {
        paused: true,
        workflowType: "reconcileRankCheckSchedulesWorkflow",
      },
    });

    await convergeRankCheckSchedulerSingletons(client);
    await convergeRankCheckSchedulerSingletons(client);

    expect(schedules.get(RECONCILER_SCHEDULE_ID)?.paused).toBe(false);
  });

  it("fails worker startup when the non-selected singleton cannot be retired", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    const { client } = clientMock({
      [RECONCILER_SCHEDULE_ID]: {
        paused: false,
        workflowType: "reconcileRankCheckSchedulesWorkflow",
      },
    });
    const handle = client.getHandle(RECONCILER_SCHEDULE_ID);
    vi.mocked(handle.pause).mockRejectedValueOnce(new Error("Temporal unavailable"));
    client.getHandle = vi.fn(() => handle);

    await expect(convergeRankCheckSchedulerSingletons(client)).rejects.toThrow("Failed to retire");
  });

  it("fails worker startup when the selected singleton has a conflicting action", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
    const { client } = clientMock({
      [RECONCILER_SCHEDULE_ID]: {
        paused: false,
        workflowType: "unrelatedWorkflow",
      },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(convergeRankCheckSchedulerSingletons(client)).rejects.toThrow(
      "Failed to ensure selected",
    );
    consoleError.mockRestore();
  });
});
