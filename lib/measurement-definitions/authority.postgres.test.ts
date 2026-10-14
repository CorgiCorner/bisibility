import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureDefinitionPolicy } from "./policy-config";
import { definitionDatabaseFixture } from "./postgres.test-fixture";
import {
  assertDefinitionAtDispatch,
  captureDefinitionBeforeIo,
  readRetainedDefinition,
} from "./producer";
import { readCurrentDefinitions, readCurrentDefinitionsInTransaction } from "./reader";

vi.mock("server-only", () => ({}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "persisted definition full-schema authority",
  () => {
    let f: Awaited<ReturnType<typeof definitionDatabaseFixture>>;
    const freshness = { cadenceIntervalMs: async () => null };
    beforeEach(async () => {
      f = await definitionDatabaseFixture();
    }, 120000);
    afterEach(async () => {
      await f?.close();
      vi.unstubAllGlobals();
    });
    async function configure() {
      const epoch = await f.client.query(
        'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
        [f.project.project.id],
      );
      await configureDefinitionPolicy(
        f.db,
        f.project.writerContext,
        {
          projectId: f.project.project.publicId,
          expectedPolicyEpoch: epoch.rows[0].epoch,
          config: f.config,
        },
        f.host.recordMutation,
      );
    }
    async function capture() {
      return f.db.$transaction((tx) => captureDefinitionBeforeIo(tx, f.input, f.host));
    }
    async function current() {
      return readCurrentDefinitions(
        f.db,
        f.project.ownerContext,
        f.project.project.publicId,
        [f.observation.keyword.publicId],
        new Date(),
        freshness,
      );
    }

    it("never backfills current revision from old captured history; reads make zero writes/provider requests", async () => {
      const http = vi.fn(() => {
        throw new Error("No provider I/O");
      });
      vi.stubGlobal("fetch", http);
      await configure();
      const before = await f.client.query("SELECT count(*)::text AS n FROM audit_logs");
      expect((await current()).get(f.observation.keyword.publicId)?.expectedScope).toBeNull();
      expect((await f.client.query("SELECT count(*)::text AS n FROM audit_logs")).rows).toEqual(
        before.rows,
      );
      expect(
        (await f.client.query("SELECT count(*)::text AS n FROM measurement_definition_heads"))
          .rows[0].n,
      ).toBe("0");
      expect(http).not.toHaveBeenCalled();
    });
    it("persists before I/O, replays one binding and blocks drift including uncaptured A->B->A", async () => {
      await configure();
      const first = await capture();
      const replay = await capture();
      expect(replay.id).toBe(first.id);
      await f.db.$transaction((tx) => assertDefinitionAtDispatch(tx, first, f.host));
      await f.db.keyword.update({
        where: { id: f.input.keywordId },
        data: { targetUrl: "https://example.test/b" },
      });
      expect((await current()).get(f.observation.keyword.publicId)?.expectedScope).toBeNull();
      await f.db.keyword.update({
        where: { id: f.input.keywordId },
        data: { targetUrl: first.source.target.targetUrl },
      });
      await expect(
        f.db.$transaction((tx) => assertDefinitionAtDispatch(tx, first, f.host)),
      ).rejects.toMatchObject({ code: "measurement_definition_conflict" });
      f.input = { ...f.input, owner: { ...f.input.owner, executionKey: randomUUID() } };
      const next = await capture();
      expect(next.targetRevision).not.toBe(first.targetRevision);
      expect(next.policyRevision).not.toBe(first.policyRevision);
      expect(
        (await current()).get(f.observation.keyword.publicId)?.expectedScope?.targetRevision,
      ).toBe(next.targetRevision);
    });
    it("changes project domain, geo/language and schedule policy independently of observed history", async () => {
      await configure();
      let previous = await capture();
      for (const mutate of [
        () =>
          f.db.project.update({
            where: { id: f.input.projectId },
            data: { domain: "next.example.test" },
          }),
        () =>
          f.db.location.update({
            where: { id: f.observation.location.id },
            data: { hl: "pl", languageCode: "pl" },
          }),
        () =>
          f.db.keywordSchedule.create({
            data: {
              keywordId: f.input.keywordId,
              frequency: "manual",
              timezone: "UTC",
              serpDepth: 20,
            },
          }),
      ]) {
        await mutate();
        expect((await current()).get(f.observation.keyword.publicId)?.expectedScope).toBeNull();
        f.input = { ...f.input, owner: { ...f.input.owner, executionKey: randomUUID() } };
        const next = await capture();
        expect(next.policyRevision).not.toBe(previous.policyRevision);
        previous = next;
      }
      expect(previous.request.depth).toBe(20);
    });
    it("rejects direct epoch resets, append-only rewrites and cross-project pointers", async () => {
      await configure();
      const binding = await capture();
      await expect(
        f.client.query('UPDATE projects SET "measurementPolicyEpoch"=0 WHERE id=$1', [
          f.input.projectId,
        ]),
      ).rejects.toThrow("definition_epoch_owned");
      await expect(
        f.client.query(
          `UPDATE measurement_execution_bindings SET request=request || jsonb_build_object('depth',20) WHERE id=$1`,
          [binding.id],
        ),
      ).rejects.toThrow("definition_append_only");
      await expect(
        f.client.query(
          `UPDATE measurement_definition_heads SET "projectId"='foreign',generation=generation+1 WHERE "keywordId"=$1`,
          [f.input.keywordId],
        ),
      ).rejects.toThrow("definition_head_cas");
    });
    it("fails fresh membership/deactivation checks before reading or rebinding", async () => {
      await configure();
      await capture();
      await f.db.membership.deleteMany({
        where: { projectId: f.input.projectId, userId: f.project.owner.id },
      });
      await expect(current()).rejects.toMatchObject({ code: "forbidden" });
      await f.db.user.update({
        where: { id: f.project.writer.id },
        data: { deactivatedAt: new Date() },
      });
      f.input = { ...f.input, owner: { ...f.input.owner, executionKey: randomUUID() } };
      await expect(capture()).rejects.toMatchObject({ code: "forbidden" });
    });
    it("treats policy configuration A->B->A as a new policy while retaining the current target", async () => {
      await configure();
      const first = await capture();
      for (const revision of ["config-b", f.config.freshness.configurationRevision]) {
        const row = await f.client.query(
          'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
          [f.input.projectId],
        );
        await configureDefinitionPolicy(
          f.db,
          f.project.writerContext,
          {
            projectId: f.project.project.publicId,
            expectedPolicyEpoch: row.rows[0].epoch,
            config: {
              ...f.config,
              freshness: { ...f.config.freshness, configurationRevision: revision },
            },
          },
          f.host.recordMutation,
        );
      }
      await expect(
        configureDefinitionPolicy(
          f.db,
          f.project.writerContext,
          {
            projectId: f.project.project.publicId,
            expectedPolicyEpoch: first.source.epochs.projectPolicy,
            config: f.config,
          },
          f.host.recordMutation,
        ),
      ).rejects.toMatchObject({ status: 409 });
      f.input = { ...f.input, owner: { ...f.input.owner, executionKey: randomUUID() } };
      const next = await capture();
      expect(next.targetRevision).toBe(first.targetRevision);
      expect(next.policyRevision).not.toBe(first.policyRevision);
    });
    it("captures one worker/queued proof and retains its original identity after task purge", async () => {
      await configure();
      const id = randomUUID();
      const batch = await f.db.queuedRankCheckBatch.create({
        data: {
          id: randomUUID(),
          projectId: f.input.projectId,
          provider: "synthetic",
          priority: "normal",
          state: "prepared",
          claimedAt: new Date(),
          queueDeadlineAt: new Date(Date.now() + 60000),
        },
      });
      await f.db.queuedRankCheckTask.create({
        data: {
          id,
          batchId: batch.id,
          keywordId: f.input.keywordId,
          rankCheckId: f.input.owner.rankCheckId,
          state: "prepared",
        },
      });
      f.input = { ...f.input, owner: { ...f.input.owner, queuedTaskId: id } };
      const first = await capture();
      expect((await capture()).id).toBe(first.id);
      await f.db.queuedRankCheckTask.delete({ where: { id } });
      const assertOwnRetrieval = vi.fn(async () => undefined);
      const retained = await f.db.$transaction((tx) =>
        readRetainedDefinition(tx, f.input, assertOwnRetrieval),
      );
      expect(retained.owner.queuedTaskId).toBe(id);
      expect(retained.request).toEqual(first.request);
      expect(assertOwnRetrieval).toHaveBeenCalledOnce();
      const link = await f.client.query(
        'SELECT "queuedTaskId" FROM measurement_execution_bindings WHERE id=$1',
        [first.id],
      );
      expect(link.rows[0].queuedTaskId).toBeNull();
    });
    it("makes project-default and assigned check-schedule changes visible before recapture", async () => {
      await configure();
      const first = await capture();
      await f.db.projectDefaults.create({
        data: { projectId: f.input.projectId, serpDepth: 20, frequency: "manual" },
      });
      expect((await current()).get(f.observation.keyword.publicId)?.expectedScope).toBeNull();
      f.input = { ...f.input, owner: { ...f.input.owner, executionKey: randomUUID() } };
      const second = await capture();
      expect(second.request.depth).toBe(20);
      const schedule = await f.db.checkSchedule.create({
        data: {
          projectId: f.input.projectId,
          publicId: makePublicId("sch"),
          name: "Synthetic schedule",
          frequency: "manual",
          serpDepth: 50,
        },
      });
      await f.db.keyword.update({
        where: { id: f.input.keywordId },
        data: { checkScheduleId: schedule.id },
      });
      f.input = { ...f.input, owner: { ...f.input.owner, executionKey: randomUUID() } };
      const third = await capture();
      expect(third.request.depth).toBe(50);
      expect(third.policyRevision).not.toBe(second.policyRevision);
      await f.db.checkSchedule.update({ where: { id: schedule.id }, data: { serpDepth: 100 } });
      await expect(
        f.db.$transaction((tx) => assertDefinitionAtDispatch(tx, third, f.host)),
      ).rejects.toMatchObject({ code: "measurement_definition_conflict" });
      expect(third.targetRevision).toBe(first.targetRevision);
    });
    it("captures actual CheckSchedule publicId and invalidates a changed planner phase identity", async () => {
      await configure();
      const schedule = await f.db.checkSchedule.create({
        data: {
          projectId: f.input.projectId,
          publicId: makePublicId("sch"),
          name: "Synthetic planner",
          frequency: "weekly",
          serpDepth: 20,
        },
      });
      await f.db.keyword.update({
        where: { id: f.input.keywordId },
        data: { checkScheduleId: schedule.id },
      });
      const first = await capture();
      expect(first.source.policy.checkSchedule?.publicId).toBe(schedule.publicId);
      const nextPublicId = makePublicId("sch");
      await f.db.checkSchedule.update({
        where: { id: schedule.id },
        data: { publicId: nextPublicId },
      });
      await expect(
        f.db.$transaction((tx) => assertDefinitionAtDispatch(tx, first, f.host)),
      ).rejects.toMatchObject({ code: "measurement_definition_conflict" });
      f.input = { ...f.input, owner: { ...f.input.owner, executionKey: randomUUID() } };
      const next = await capture();
      expect(next.source.policy.checkSchedule?.publicId).toBe(nextPublicId);
      expect(next.source.epochs.checkSchedule).not.toBe(first.source.epochs.checkSchedule);
      expect(next.policyRevision).not.toBe(first.policyRevision);
    });
    it("supports a real PostgreSQL read-only transaction and detects disabled epoch guards", async () => {
      await configure();
      const binding = await capture();
      const result = await f.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          return readCurrentDefinitionsInTransaction(
            tx,
            f.project.ownerContext,
            f.project.project.publicId,
            [f.observation.keyword.publicId],
            new Date(),
            freshness,
          );
        },
        { isolationLevel: "RepeatableRead" },
      );
      expect(result.get(f.observation.keyword.publicId)?.expectedScope?.targetRevision).toBe(
        binding.targetRevision,
      );
      await f.client.query("ALTER TABLE keywords DISABLE TRIGGER measurement_keywords_epochs");
      try {
        await expect(current()).rejects.toMatchObject({ code: "measurement_definition_integrity" });
      } finally {
        await f.client.query("ALTER TABLE keywords ENABLE TRIGGER measurement_keywords_epochs");
      }
    });
    it("rejects a queued owner whose task batch belongs to another project", async () => {
      await configure();
      const foreign = await f.db.project.create({
        data: {
          publicId: makePublicId("prj"),
          ownerId: f.project.writer.id,
          name: "Foreign fixture",
          domain: "foreign.example.test",
        },
      });
      const batch = await f.db.queuedRankCheckBatch.create({
        data: {
          id: randomUUID(),
          projectId: foreign.id,
          provider: "synthetic",
          priority: "normal",
          state: "prepared",
          claimedAt: new Date(),
          queueDeadlineAt: new Date(Date.now() + 60000),
        },
      });
      const task = await f.db.queuedRankCheckTask.create({
        data: {
          id: randomUUID(),
          batchId: batch.id,
          keywordId: f.input.keywordId,
          rankCheckId: f.input.owner.rankCheckId,
          state: "prepared",
        },
      });
      f.input = { ...f.input, owner: { ...f.input.owner, queuedTaskId: task.id } };
      await expect(capture()).rejects.toThrow("definition_queue_owner_mismatch");
      expect(
        (await f.client.query("SELECT count(*)::int AS n FROM measurement_execution_bindings"))
          .rows[0].n,
      ).toBe(0);
    });
    it("rolls back all revision/head/binding writes when the mandatory audit port fails", async () => {
      await configure();
      const broken = {
        ...f.host,
        recordMutation: async () => {
          throw new Error("Synthetic audit failure");
        },
      };
      await expect(
        f.db.$transaction((tx) => captureDefinitionBeforeIo(tx, f.input, broken)),
      ).rejects.toThrow("Synthetic audit failure");
      const counts = await f.client.query(
        "SELECT (SELECT count(*)::int FROM measurement_target_revisions) AS targets,(SELECT count(*)::int FROM measurement_policy_revisions) AS policies,(SELECT count(*)::int FROM measurement_definition_heads) AS heads,(SELECT count(*)::int FROM measurement_execution_bindings) AS bindings",
      );
      expect(counts.rows[0]).toEqual({ targets: 0, policies: 0, heads: 0, bindings: 0 });
    });
  },
);
