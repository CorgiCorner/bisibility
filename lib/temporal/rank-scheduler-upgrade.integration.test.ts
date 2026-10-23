import { TestWorkflowEnvironment } from "@temporalio/testing";
import { expect, it, vi } from "vitest";
import { buildRankCheckScheduleOptions } from "../rank-check/legacy-schedule-builder";
import { upgradeRankScheduler } from "../rank-check/scheduler-upgrade";
import { createSchedulerUpgradeStore } from "../rank-check/scheduler-upgrade-store";
import { RECONCILE_WORKFLOW_TYPE, RECONCILER_SCHEDULE_ID } from "./bootstrap";
import { RANK_CHECK_PLANNER_SCHEDULE_ID } from "./rank-check-planner-bootstrap";
import { ensureRankCheckSearchAttributes } from "./search-attribute-bootstrap";

it.skipIf(process.env.BISIBILITY_RANK_SCHEDULER_UPGRADE_INTEGRATION !== "1")(
  "upgrades a real legacy Temporal installation without deleting its history or unrelated schedules",
  async () => {
    const environment = await TestWorkflowEnvironment.createLocal();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    try {
      await ensureRankCheckSearchAttributes(environment.nativeConnection, {
        address: environment.address,
        namespace: environment.client.options.namespace,
      });
      const options = buildRankCheckScheduleOptions({
        keywordId: "upgrade-keyword",
        projectId: "upgrade-project",
        schedule: { frequency: "daily", jitterMinutes: 0, timezone: "UTC" },
      });
      options.state = { paused: false };
      await environment.client.schedule.create(options);
      const singleton = async (id: string, workflowType: string) =>
        environment.client.schedule.create({
          scheduleId: id,
          action: { type: "startWorkflow", taskQueue: "upgrade", workflowType, workflowId: id },
          spec: { intervals: [{ every: "24 hours" }] },
        });
      await singleton(RECONCILER_SCHEDULE_ID, RECONCILE_WORKFLOW_TYPE);
      await singleton("maintenance-upgrade-unrelated", "purgeAuditLogsWorkflow");
      // Temporal visibility is eventually consistent; wait for the real inventory before testing.
      for (let n = 0; n < 100; n++) {
        const ids = [];
        for await (const item of environment.client.schedule.list()) ids.push(item.scheduleId);
        if (ids.length === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const database = {
        $queryRaw: vi.fn(async () => []),
        keyword: {
          findMany: vi.fn(async () => [{ id: "upgrade-keyword", projectId: "upgrade-project" }]),
        },
      };
      const store = createSchedulerUpgradeStore(environment.client, database as never);
      expect(
        await upgradeRankScheduler(store, { apply: false, workersStopped: false }),
      ).toMatchObject({ legacySchedules: 1, applied: false });
      expect(
        (await environment.client.schedule.getHandle(options.scheduleId).describe()).state.paused,
      ).toBe(false);
      expect(
        await upgradeRankScheduler(store, { apply: true, workersStopped: true }),
      ).toMatchObject({ applied: true });
      expect(process.env.RANK_CHECK_SCHEDULER_MODE).toBe("cutover");
      expect(
        (await environment.client.schedule.getHandle(options.scheduleId).describe()).state.paused,
      ).toBe(true);
      expect(
        (await environment.client.schedule.getHandle(RECONCILER_SCHEDULE_ID).describe()).state
          .paused,
      ).toBe(true);
      expect(
        (await environment.client.schedule.getHandle(RANK_CHECK_PLANNER_SCHEDULE_ID).describe())
          .state.paused,
      ).toBe(false);
      expect(
        (await environment.client.schedule.getHandle("maintenance-upgrade-unrelated").describe())
          .state.paused,
      ).toBe(false);
      // A Schedule owned by a different database must never be paused by this installation.
      database.keyword.findMany.mockResolvedValue([]);
      await expect(
        upgradeRankScheduler(store, { apply: true, workersStopped: true }),
      ).rejects.toThrow("ambiguous");
      const report = await upgradeRankScheduler(store, { apply: false, workersStopped: false });
      expect(report.unknownSchedules).toEqual([
        expect.objectContaining({ reason: "keyword_missing", paused: true }),
      ]);
      expect(
        await upgradeRankScheduler(store, {
          apply: true,
          workersStopped: true,
          acceptPausedUnknown: true,
        }),
      ).toMatchObject({ applied: true });
      database.keyword.findMany.mockResolvedValue([
        { id: "upgrade-keyword", projectId: "another-project" },
      ]);
      await expect(
        upgradeRankScheduler(store, {
          apply: true,
          workersStopped: true,
          acceptPausedUnknown: true,
        }),
      ).rejects.toThrow("ambiguous");
    } finally {
      vi.unstubAllEnvs();
      await environment.teardown();
    }
  },
  120_000,
);

it.skipIf(
  process.env.BISIBILITY_RANK_SCHEDULER_UPGRADE_INTEGRATION !== "1" ||
    !process.env.PROVIDER_UI_TEST_DATABASE_URL,
)(
  "runs the packaged offline CLI against an empty migrated PostgreSQL install and real Temporal",
  async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const environment = await TestWorkflowEnvironment.createLocal();
    const env = {
      ...process.env,
      DATABASE_URL: process.env.PROVIDER_UI_TEST_DATABASE_URL,
      TEMPORAL_ADDRESS: environment.address,
      TEMPORAL_NAMESPACE: environment.client.options.namespace,
      TEMPORAL_TLS: "false",
      // The command must override retired settings in its own process only.
      RANK_CHECK_SCHEDULER_MODE: "legacy",
      RANK_CHECK_RECONCILER_ENABLED: "true",
    };
    try {
      const args = [
        "--experimental-transform-types",
        "--import",
        "./lib/temporal/register-loader.mjs",
        "scripts/self-host/upgrade-rank-scheduler.ts",
      ];
      const preview = await run(process.execPath, [...args, "--dry-run"], { env, timeout: 30_000 });
      expect(preview.stdout).toContain('"applied":false');
      const unknown = await run(process.execPath, [...args, "--list-unknown"], {
        env,
        timeout: 30_000,
      });
      expect(unknown.stdout).toContain('"unknownSchedules":[]');
      const repair = await run(process.execPath, [...args, "--dry-run", "--repair-assignments"], {
        env,
        timeout: 30_000,
      });
      expect(repair.stdout).toContain('"assignments":[]');
      const result = await run(process.execPath, [...args, "--apply", "--workers-stopped"], {
        env,
        timeout: 30_000,
      });
      expect(result.stdout).toContain('"applied":true');
      expect(
        (await environment.client.schedule.getHandle(RANK_CHECK_PLANNER_SCHEDULE_ID).describe())
          .state.paused,
      ).toBe(false);
    } finally {
      await environment.teardown();
    }
  },
  90_000,
);
