import { resolve } from "node:path";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { runLegacyScheduleRollback } from "../rank-check/legacy-schedule-rollback";
import { ensurePausedRollbackScheduleWithClient } from "../rank-check/legacy-schedule-rollback-schedule";
import {
  buildRankCheckScheduleOptions,
  rankCheckScheduleId,
} from "../rank-check/temporal-schedule";
import {
  countTemporalSystemSchedulers,
  deleteOwnedRankCheckSchedule,
  inventoryRankCheckSchedules,
  pauseOwnedRankCheckSchedule,
} from "../rank-check/temporal-schedule-inventory";
import { RANK_CHECK_WORKFLOW_TYPE } from "../rank-check/workflow-id";
import { RECONCILER_SCHEDULE_ID } from "./bootstrap";
import { rankCheckSearchAttributes } from "./client";
import { convergeRankCheckSchedulerSingletons } from "./rank-check-scheduler-convergence";
import { ensureRankCheckSearchAttributes } from "./search-attribute-bootstrap";

const integration = process.env.BISIBILITY_TEMPORAL_D1_INTEGRATION === "1";

describe.runIf(integration)("D1 real Temporal integration", () => {
  let environment: TestWorkflowEnvironment;
  const taskQueue = `rank-check-d1-${process.pid}`;

  beforeAll(async () => {
    environment = await TestWorkflowEnvironment.createLocal();
    await ensureRankCheckSearchAttributes(environment.nativeConnection, {
      address: environment.address,
      namespace: environment.client.options.namespace,
    });
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await environment?.teardown();
  });

  async function createSingleton(scheduleId: string, workflowType: string) {
    await environment.client.schedule.create({
      action: {
        args: [],
        taskQueue,
        type: "startWorkflow",
        workflowId: scheduleId,
        workflowType,
      },
      scheduleId,
      spec: { intervals: [{ every: "1 hour" }] },
    });
  }

  it("actively converges every mode and preserves an unrelated singleton", async () => {
    await createSingleton(RECONCILER_SCHEDULE_ID, "reconcileRankCheckSchedulesWorkflow");
    await createSingleton(RANK_CHECK_DISPATCHER_SCHEDULE_ID, "dispatchDueRankChecksWorkflow");
    await createSingleton("maintenance-d1-unrelated", "purgeAuditLogsWorkflow");

    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    await convergeRankCheckSchedulerSingletons(environment.client.schedule);
    expect(
      (await environment.client.schedule.getHandle(RECONCILER_SCHEDULE_ID).describe()).state.paused,
    ).toBe(true);
    expect(
      (await environment.client.schedule.getHandle(RANK_CHECK_DISPATCHER_SCHEDULE_ID).describe())
        .state.paused,
    ).toBe(true);

    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    await convergeRankCheckSchedulerSingletons(environment.client.schedule);
    expect(
      (await environment.client.schedule.getHandle(RANK_CHECK_DISPATCHER_SCHEDULE_ID).describe())
        .state.paused,
    ).toBe(false);
    expect(
      (await environment.client.schedule.getHandle(RECONCILER_SCHEDULE_ID).describe()).state.paused,
    ).toBe(true);

    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
    await convergeRankCheckSchedulerSingletons(environment.client.schedule);
    expect(
      (await environment.client.schedule.getHandle(RECONCILER_SCHEDULE_ID).describe()).state.paused,
    ).toBe(false);
    expect(
      (await environment.client.schedule.getHandle("maintenance-d1-unrelated").describe()).state
        .paused,
    ).toBe(false);
  });

  it("stops real late legacy and dispatcher starts before lifecycle work", async () => {
    const keywordId = "d1-temporal-keyword";
    const scheduleId = rankCheckScheduleId(keywordId);
    const searchAttributes = rankCheckSearchAttributes({
      keywordId,
      projectId: "d1-project",
    });
    const authorization = vi.fn(async (input: { source: string }) => ({
      allowed: false,
      mode: "cutover",
      reason: "automatic legacy execution is disabled in cutover mode",
      source: input.source,
    }));
    const createRunning = vi.fn(async () => {
      throw new Error("lifecycle activity must not run");
    });
    const worker = await Worker.create({
      activities: {
        authorizeRankCheckExecutionActivity: authorization,
        createRunningRankCheckActivity: createRunning,
      },
      connection: environment.nativeConnection,
      namespace: environment.client.options.namespace,
      taskQueue,
      workflowsPath: resolve(process.cwd(), "lib/temporal/workflows.ts"),
    });
    await environment.client.schedule.create({
      action: {
        args: [{ keywordId }],
        taskQueue,
        typedSearchAttributes: searchAttributes,
        type: "startWorkflow",
        workflowId: scheduleId,
        workflowType: RANK_CHECK_WORKFLOW_TYPE,
      },
      memo: { kind: "rank-check", keywordId, projectId: "d1-project" },
      scheduleId,
      spec: { intervals: [{ every: "1 day" }] },
      typedSearchAttributes: searchAttributes,
    });

    const result = await worker.runUntil(async () => {
      const schedule = environment.client.schedule.getHandle(scheduleId);
      await schedule.trigger();
      let legacy: unknown;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const action = (await schedule.describe()).info.recentActions.at(-1)?.action;
        if (action?.type === "startWorkflow") {
          legacy = await environment.client.workflow
            .getHandle(action.workflow.workflowId, action.workflow.firstExecutionRunId)
            .result();
          break;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
      if (!legacy) throw new Error("Triggered Schedule did not report a workflow action.");
      const dispatcher = await environment.client.workflow.execute(RANK_CHECK_WORKFLOW_TYPE, {
        args: [
          {
            dispatch: {
              scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
              scheduledAt: "2026-07-29T00:00:00.000Z",
            },
            keywordId: "d1-dispatcher-keyword",
          },
        ],
        taskQueue,
        workflowId: "d1-late-dispatcher-workflow",
      });
      return { dispatcher, legacy };
    });

    expect(result.legacy).toMatchObject({ deferred: true, keywordId });
    expect(result.dispatcher).toMatchObject({
      deferred: true,
      keywordId: "d1-dispatcher-keyword",
    });
    expect(authorization).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId, source: "legacy" }),
    );
    expect(authorization).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
        source: "dispatcher",
      }),
    );
    expect(createRunning).not.toHaveBeenCalled();
  }, 120_000);

  it("retires only exact owned Schedules and conserves unrelated schedulers", async () => {
    await environment.client.schedule.create(
      buildRankCheckScheduleOptions({
        keywordId: "d1-retire-keyword",
        projectId: "d1-retire-project",
        schedule: {
          frequency: "daily",
          jitterMinutes: 0,
          timezone: "UTC",
        },
      }),
    );
    const before = await inventoryRankCheckSchedules(10, environment.client.schedule);
    const schedulerBefore = await countTemporalSystemSchedulers(environment.client);
    expect(before.ambiguousIds).toEqual([]);
    expect(before.ownedIds.length).toBeGreaterThanOrEqual(2);

    for (const scheduleId of before.ownedIds) {
      await pauseOwnedRankCheckSchedule(scheduleId, environment.client.schedule);
      await deleteOwnedRankCheckSchedule(scheduleId, environment.client.schedule);
    }

    const after = await inventoryRankCheckSchedules(10, environment.client.schedule);
    let schedulerAfter = await countTemporalSystemSchedulers(environment.client);
    for (
      let attempt = 0;
      attempt < 20 && schedulerAfter !== schedulerBefore - before.ownedIds.length;
      attempt += 1
    ) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      schedulerAfter = await countTemporalSystemSchedulers(environment.client);
    }
    expect(after.ownedIds).toEqual([]);
    expect(after.unrelatedHash).toBe(before.unrelatedHash);
    expect(schedulerAfter).toBe(schedulerBefore - before.ownedIds.length);
    expect(schedulerAfter).toBeGreaterThan(0);
  });

  it("does not retire or overwrite a Schedule with contradictory attribute levels", async () => {
    const input = {
      keywordId: "d1-attribute-mismatch",
      projectId: "d1-attribute-project",
      schedule: {
        frequency: "daily" as const,
        jitterMinutes: 0,
        timezone: "UTC",
      },
    };
    const options = buildRankCheckScheduleOptions(input);
    options.typedSearchAttributes = rankCheckSearchAttributes({
      keywordId: "d1-attribute-other",
      projectId: input.projectId,
    });
    await environment.client.schedule.create(options);
    const scheduleId = rankCheckScheduleId(input.keywordId);

    const inventory = await inventoryRankCheckSchedules(10, environment.client.schedule);
    expect(inventory.ambiguousIds).toContain(scheduleId);
    await expect(
      pauseOwnedRankCheckSchedule(scheduleId, environment.client.schedule),
    ).rejects.toThrow("no longer satisfies exact ownership invariants");
    await expect(
      deleteOwnedRankCheckSchedule(scheduleId, environment.client.schedule),
    ).rejects.toThrow("no longer satisfies exact ownership invariants");
    await expect(
      ensurePausedRollbackScheduleWithClient(input, environment.client.schedule),
    ).rejects.toThrow("is not exact owned state");
    expect((await environment.client.schedule.getHandle(scheduleId).describe()).state.paused).toBe(
      false,
    );
    await environment.client.schedule.getHandle(scheduleId).delete();
  });

  it("dry-runs and recreates an exact paused monthly rollback Schedule", async () => {
    const keywordId = "d1-rollback-keyword";
    const scheduleId = rankCheckScheduleId(keywordId);
    const rollbackInput = {
      keywordId,
      projectId: "d1-rollback-project",
      schedule: {
        cronExpression: null,
        frequency: "monthly" as const,
        jitterMinutes: 0,
        nextCheckAt: new Date("2026-08-17T09:30:00.000Z"),
        timezone: "Europe/Warsaw",
      },
    };
    const inventory = () =>
      inventoryRankCheckSchedules(10, environment.client.schedule).then((result) => ({
        ambiguousIds: result.ambiguousIds,
        ownedIds: result.ownedIds,
        pausedOwnedIds: result.pausedOwnedIds,
        unrelatedHash: result.unrelatedHash,
        unrelatedIds: result.unrelatedIds,
      }));
    const ensurePaused = vi.fn(async () => {
      const options = buildRankCheckScheduleOptions(rollbackInput);
      options.state = { note: "D1 rollback prepared", paused: true };
      await environment.client.schedule.create(options);
      return "created";
    });
    const store = {
      coverage: async () => ({
        coverageCountsStable: true,
        eligible: 1,
        eligibleWithState: 1,
        exact: true,
        gone: 0,
        ineligible: 0,
        maxNextCheckAt: rollbackInput.schedule.nextCheckAt.toISOString(),
        minNextCheckAt: rollbackInput.schedule.nextCheckAt.toISOString(),
        missing: 0,
        oldestDueLagMs: 0,
        recurrenceMismatches: 0,
        recurrenceScanRows: 1,
        recurrenceScanStable: true,
      }),
      ensurePaused,
      inventory,
      preflight: async () => ({ claimsStopped: true, paidInFlightSafe: true }),
      readPage: async () => ({ cursor: keywordId, done: true, rows: [rollbackInput] }),
      schedulerCount: () => countTemporalSystemSchedulers(environment.client),
      verify: async () => {
        const current = await inventoryRankCheckSchedules(10, environment.client.schedule);
        return {
          exact: current.pausedOwnedIds.includes(scheduleId),
          missing: current.pausedOwnedIds.includes(scheduleId) ? 0 : 1,
          unexpected: 0,
        };
      },
      writerQuiescence: async () => ({
        evidence: {} as never,
        ready: true,
        reasons: [],
      }),
    };

    const dryRun = await runLegacyScheduleRollback({
      dryRun: true,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });
    expect(dryRun.verdict).toBe("PASS");
    expect(ensurePaused).not.toHaveBeenCalled();

    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });
    const description = await environment.client.schedule.getHandle(scheduleId).describe();
    expect(result.verdict).toBe("PASS");
    expect(description.state.paused).toBe(true);
    expect(description.spec.timezone).toBe("Europe/Warsaw");
    expect(description.spec.calendars?.[0]).toMatchObject({
      dayOfMonth: [{ end: 17, start: 17, step: 1 }],
      hour: [{ end: 11, start: 11, step: 1 }],
      minute: [{ end: 30, start: 30, step: 1 }],
    });
    await deleteOwnedRankCheckSchedule(scheduleId, environment.client.schedule);
  });
});
