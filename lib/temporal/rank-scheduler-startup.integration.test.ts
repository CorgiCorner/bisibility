import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { buildRankCheckScheduleOptions } from "@/lib/rank-check/legacy-schedule-builder";
import { upgradeRankSchedulerAtStartup } from "@/lib/rank-check/scheduler-startup";
import { readSchedulerUpgradeConflicts } from "@/lib/rank-check/scheduler-upgrade-conflicts";
import { repairMissingScheduleAssignments } from "@/lib/rank-check/scheduler-upgrade-repair";
import { createSchedulerUpgradeStore } from "@/lib/rank-check/scheduler-upgrade-store";
import { PrismaPg } from "@prisma/adapter-pg";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { expect, it, vi } from "vitest";
import { RECONCILE_WORKFLOW_TYPE, RECONCILER_SCHEDULE_ID } from "./bootstrap";
import { RANK_CHECK_PLANNER_SCHEDULE_ID } from "./rank-check-planner-bootstrap";
import { retireLegacyRankCheckReconciler } from "./rank-check-scheduler-convergence";
import { ensureRankCheckSearchAttributes } from "./search-attribute-bootstrap";

it.skipIf(
  process.env.BISIBILITY_RANK_SCHEDULER_STARTUP_INTEGRATION !== "1" ||
    !process.env.PROVIDER_UI_TEST_DATABASE_URL,
)(
  "automatically upgrades on real PostgreSQL and Temporal, preserving named intent and retrying safely",
  async () => {
    const url = process.env.PROVIDER_UI_TEST_DATABASE_URL;
    if (!url) throw new Error("Missing fixture database URL.");
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) ||
      (process.env.CI !== "true" && new URL(url).pathname !== "/d2")
    )
      throw new Error("This fixture requires the owned loopback d2 database.");
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const environment = await TestWorkflowEnvironment.createLocal();
    const ownerId = randomUUID();
    const projectId = randomUUID();
    const locationId = randomUUID();
    try {
      await db.user.create({
        data: {
          id: ownerId,
          publicId: makePublicId("usr"),
          email: `${ownerId}@example.test`,
          name: "Upgrade fixture",
          deactivatedAt: new Date(),
        },
      });
      await db.project.create({
        data: {
          id: projectId,
          publicId: makePublicId("prj"),
          ownerId,
          domain: "example.test",
          name: "Upgrade fixture",
          writeMode: "migration_hold",
        },
      });
      await db.projectDefaults.create({
        data: { projectId, frequency: "daily", timezone: "UTC", jitterMinutes: 60 },
      });
      await db.location.create({
        data: {
          id: locationId,
          kind: "country",
          displayName: "United States",
          countryCode: "US",
          gl: "us",
          hl: "en",
          languageCode: "en",
          languageLabel: "English",
          primaryGeoName: "United States",
          secondaryGeoName: "",
          canonicalKey: randomUUID(),
        },
      });
      const named = await db.checkSchedule.create({
        data: {
          publicId: makePublicId("sch"),
          projectId,
          name: "Existing weekly",
          frequency: "weekly",
          enabled: false,
        },
      });
      const keywords = [];
      for (const name of [
        "missing",
        "named",
        "manual",
        "paused",
        "ambiguous",
        "invalid",
        "deep",
      ] as const) {
        const keyword = await db.keyword.create({
          data: {
            publicId: makePublicId("kw"),
            projectId,
            text: name,
            location: "United States",
            locationId,
            checkScheduleId: name === "named" ? named.id : null,
            archivedAt: name === "missing" ? new Date() : null,
          },
        });
        const frequency =
          name === "manual"
            ? "manual"
            : name === "paused"
              ? "paused"
              : name === "ambiguous"
                ? "monthly"
                : "daily";
        await db.keywordSchedule.create({
          data: {
            keywordId: keyword.id,
            frequency,
            timezone: name === "invalid" ? "Invalid/Zone" : "UTC",
            serpDepth: name === "deep" ? 50 : null,
            jitterMinutes: 60,
          },
        });
        keywords.push(keyword);
      }
      const [missingKeyword, namedKeyword] = keywords;
      if (!missingKeyword || !namedKeyword) throw new Error("Incomplete fixture.");
      for (const name of ["Monthly A", "Monthly B"])
        await db.checkSchedule.create({
          data: {
            publicId: makePublicId("sch"),
            projectId,
            name,
            frequency: "monthly",
            timezone: "UTC",
            jitterMinutes: 60,
          },
        });
      await ensureRankCheckSearchAttributes(environment.nativeConnection, {
        address: environment.address,
        namespace: environment.client.options.namespace,
      });
      const legacy = buildRankCheckScheduleOptions({
        keywordId: missingKeyword.id,
        projectId,
        schedule: { frequency: "daily", jitterMinutes: 60, timezone: "UTC" },
      });
      await environment.client.schedule.create({ ...legacy, state: { paused: false } });
      await environment.client.schedule.create({
        scheduleId: RECONCILER_SCHEDULE_ID,
        spec: { intervals: [{ every: "1 hour" }] },
        action: {
          type: "startWorkflow",
          workflowType: RECONCILE_WORKFLOW_TYPE,
          workflowId: RECONCILER_SCHEDULE_ID,
          taskQueue: "fixture",
        },
      });
      await environment.client.schedule.create({
        scheduleId: "ai-fixture-unrelated",
        spec: { intervals: [{ every: "1 hour" }] },
        action: { type: "startWorkflow", workflowType: "aiFixtureWorkflow", taskQueue: "fixture" },
      });
      const store = {
        ...createSchedulerUpgradeStore(environment.client, db),
        retireReconciler: () => retireLegacyRankCheckReconciler(environment.client.schedule),
        repair: () =>
          repairMissingScheduleAssignments(true, db, { automatic: true, createMissing: true }),
      };
      const result = await upgradeRankSchedulerAtStartup(store);
      expect(result).toMatchObject({ recoveredKeywords: 2, pausedLegacySchedules: 1 });
      expect(
        (await environment.client.schedule.getHandle(legacy.scheduleId).describe()).state.paused,
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
        (await environment.client.schedule.getHandle("ai-fixture-unrelated").describe()).state
          .paused,
      ).toBe(false);
      const recovered = await db.keyword.findUniqueOrThrow({
        where: { id: missingKeyword.id },
        include: { checkSchedule: true },
      });
      expect(recovered.checkSchedule).toMatchObject({
        frequency: "daily",
        timezone: "UTC",
        jitterMinutes: 60,
        isDefault: false,
      });
      expect(await db.checkSchedule.findUnique({ where: { id: named.id } })).toMatchObject({
        enabled: false,
        frequency: "weekly",
      });
      expect(await db.keyword.findUnique({ where: { id: namedKeyword.id } })).toMatchObject({
        checkScheduleId: named.id,
      });
      const deep = keywords.find((keyword) => keyword.text === "deep");
      if (!deep) throw new Error("Missing depth fixture.");
      expect(
        await db.keyword.findUnique({ where: { id: deep.id }, include: { checkSchedule: true } }),
      ).toMatchObject({ checkSchedule: { serpDepth: 50 } });
      for (const keyword of keywords.filter((keyword) =>
        ["manual", "paused", "ambiguous", "invalid"].includes(keyword.text),
      ))
        expect(await db.keyword.findUnique({ where: { id: keyword.id } })).toMatchObject({
          checkScheduleId: null,
        });
      const issues = (await readSchedulerUpgradeConflicts(db, projectId)).filter(
        (row) => row.reason !== "legacy_override_mismatch",
      );
      expect(issues.map((row) => row.keywordText).sort()).toEqual(["ambiguous", "invalid"]);
      // A user switching to manual while recovery waits for the project keeps that choice.
      const manual = keywords.find((keyword) => keyword.text === "manual");
      if (!manual) throw new Error("Missing manual fixture.");
      await db.keywordSchedule.update({
        where: { keywordId: manual.id },
        data: { frequency: "daily" },
      });
      let releaseEditor!: () => void;
      let editorLocked!: () => void;
      const release = new Promise<void>((resolve) => {
        releaseEditor = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        editorLocked = resolve;
      });
      const editor = db.$transaction(
        async (tx) => {
          await lockProjectForProviderMutation(tx, projectId);
          await tx.keywordSchedule.update({
            where: { keywordId: manual.id },
            data: { frequency: "manual" },
          });
          editorLocked();
          await release;
        },
        { timeout: 15_000 },
      );
      await locked;
      const repair = store.repair();
      try {
        await vi.waitFor(
          async () => {
            const waiting = await db.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND state = 'active'
                AND wait_event_type = 'Lock'
                AND query LIKE '%FROM "projects"%FOR UPDATE%'
            ) AS waiting`;
            expect(waiting[0]?.waiting).toBe(true);
          },
          { timeout: 5_000, interval: 20 },
        );
      } finally {
        releaseEditor();
        await Promise.all([editor, repair]);
      }
      expect(await db.keyword.findUnique({ where: { id: manual.id } })).toMatchObject({
        checkScheduleId: null,
      });
      const count = await db.checkSchedule.count({ where: { projectId } });
      const parallel = await db.keyword.create({
        data: {
          publicId: makePublicId("kw"),
          projectId,
          text: "parallel",
          location: "United States",
          locationId,
        },
      });
      await db.keywordSchedule.create({
        data: { keywordId: parallel.id, frequency: "weekly", timezone: "UTC", jitterMinutes: 60 },
      });
      // Two replicas recover the same missing cadence only once.
      const repairs = await Promise.all([store.repair(), store.repair()]);
      expect(
        repairs.flatMap((repair) => repair.assignments).filter((assignment) => assignment.assigned),
      ).toHaveLength(1);
      expect(await db.checkSchedule.count({ where: { projectId } })).toBe(count + 1);
      await db.keyword.update({ where: { id: recovered.id }, data: { checkScheduleId: null } });
      await db.keywordSchedule.update({
        where: { keywordId: recovered.id },
        data: { frequency: "manual" },
      });
      expect(await upgradeRankSchedulerAtStartup(store)).toMatchObject({ recoveredKeywords: 0 });
      expect(await db.keyword.findUnique({ where: { id: recovered.id } })).toMatchObject({
        checkScheduleId: null,
      });
    } finally {
      await environment.teardown();
      await db.project.deleteMany({ where: { id: projectId } });
      await db.location.deleteMany({ where: { id: locationId } });
      await db.user.deleteMany({ where: { id: ownerId } });
      await db.$disconnect();
    }
  },
  120_000,
);
