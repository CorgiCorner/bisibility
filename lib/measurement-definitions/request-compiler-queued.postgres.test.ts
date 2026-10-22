import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { queuedDefinitionPermit } from "./worker-claim";
import { nativeRequestFixture } from "./worker-native.fixtures";
import { workerNativeFixture } from "./worker-native.postgres.test-fixture";
import { captureWorkerDefinition } from "./worker-session";

const invocation = vi.hoisted(() => ({ workflowId: "owned-queued", runId: "owned-queued-run" }));
vi.mock("@temporalio/activity", () => ({
  Context: { current: () => ({ info: { workflowExecution: invocation } }) },
}));
vi.mock("server-only", () => ({}));
// Entitlement/adapter configuration is synthetic; ownership, intent, SQL and native proof are real.
vi.mock("./worker-composition", () => ({
  workerDefinitionPorts: {
    recordMutation: async () => undefined,
    assertImplementedAdapter: async () => undefined,
    assertEntitlement: async () => undefined,
  },
}));

it.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "resumes an original prepared queued binding and rejects a changed body or workflow",
  async () => {
    const f = await workerNativeFixture(invocation);
    try {
      const original = await f.create();
      const batch = await f.db.queuedRankCheckBatch.create({
        data: {
          id: randomUUID(),
          projectId: original.keyword.projectId,
          runId: original.run.id,
          connectionId: f.connection.id,
          provider: "dataforseo",
          priority: "normal",
          state: "prepared",
          trigger: "manual",
          claimedAt: new Date(),
          queueDeadlineAt: new Date(Date.now() + 60000),
          definitionWorkflowId: invocation.workflowId,
          definitionWorkflowRunId: invocation.runId,
        },
      });
      const task = await f.db.queuedRankCheckTask.create({
        data: {
          id: randomUUID(),
          batchId: batch.id,
          keywordId: original.keyword.id,
          rankCheckId: original.check.id,
          state: "prepared",
        },
      });
      const legacy: Record<string, unknown> = {
        ...original.binding.request,
        stopOnMatch: true,
        findTargetsIn: "with_subdomains",
      };
      delete legacy.compilerVersion;
      const bindingId = randomUUID();
      const owner = {
        rankCheckId: original.check.id,
        queuedTaskId: task.id,
        executionKey: `queued-definition:${task.id}`,
      };
      await f.client.query(
        `INSERT INTO measurement_execution_bindings
          (id,"projectId","keywordId","rankCheckId","executionKey","queuedTaskId",
          "targetRevisionId","policyRevisionId",owner,request,source)
         SELECT $1,"projectId","keywordId","rankCheckId",$2,$3,
          "targetRevisionId","policyRevisionId",$4::jsonb,$5::jsonb,source
         FROM measurement_execution_bindings WHERE id=$6`,
        [
          bindingId,
          owner.executionKey,
          task.id,
          JSON.stringify(owner),
          JSON.stringify(legacy),
          original.binding.id,
        ],
      );
      const resume = () =>
        f.db.$transaction(async (tx) => {
          const permit = await queuedDefinitionPermit(tx, original.check.id, false);
          return captureWorkerDefinition(tx, {
            permit,
            projectId: original.keyword.projectId,
            keywordId: original.keyword.id,
            queuedTaskId: task.id,
            connection: { ...f.connection, credentialSource: "own" },
          });
        });
      const session = await resume();
      expect(session.binding.id).toBe(bindingId);
      expect(session.binding.request).toEqual(legacy);
      const live = nativeRequestFixture(session.binding);
      const child = (live.body as Record<string, unknown>[])[0];
      const queued = {
        ...live,
        url: live.url.replace("live/advanced", "task_post"),
        body: [{ ...child, priority: 1 }],
      };
      const operationId = randomUUID();
      for (let replay = 0; replay < 2; replay++)
        await f.db.$transaction((tx) =>
          session.beforeReserve.assertRequest(tx, operationId, queued),
        );
      const proofs = await f.client.query(
        'SELECT proof FROM measurement_native_request_proofs WHERE "bindingId"=$1 AND "operationId"=$2',
        [bindingId, operationId],
      );
      expect(proofs.rows).toHaveLength(1);
      expect(proofs.rows[0].proof).toMatchObject({
        route: "queued",
        requestedDepth: 20,
        priority: 1,
      });
      const { stop_crawl_on_match, find_targets_in, ...fullDepthChild } = child;
      expect(stop_crawl_on_match).toBeDefined();
      expect(find_targets_in).toBeDefined();
      await expect(
        f.db.$transaction((tx) =>
          session.beforeReserve.assertRequest(tx, operationId, {
            ...queued,
            body: [{ ...fullDepthChild, priority: 1 }],
          }),
        ),
      ).rejects.toMatchObject({ code: "measurement_definition_unavailable" });
      await expect(
        f.db.queuedRankCheckBatch.update({
          where: { id: batch.id },
          data: { definitionWorkflowRunId: "another-workflow" },
        }),
      ).rejects.toThrow("measurement_queue_workflow_immutable");
      const originalRunId = invocation.runId;
      try {
        invocation.runId = "another-workflow";
        await expect(resume()).rejects.toMatchObject({
          code: "measurement_definition_unavailable",
        });
      } finally {
        invocation.runId = originalRunId;
      }
    } finally {
      await f.close();
    }
  },
  120000,
);
