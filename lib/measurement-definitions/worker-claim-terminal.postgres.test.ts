import { randomUUID } from "node:crypto";
import { deriveCheckAttemptSummary } from "@/lib/checks/attempts";
import { expect, test, vi } from "vitest";
import { claimDefinitionPaidCall } from "./worker-claim";
import { workerNativeFixture } from "./worker-native.postgres.test-fixture";

const invocation = vi.hoisted(() => ({ workflowId: "owned-worker", runId: "owned-workflow-run" }));
vi.mock("@temporalio/activity", () => ({
  Context: { current: () => ({ info: { workflowExecution: invocation } }) },
}));
vi.mock("server-only", () => ({}));

test.each(["deferred", "failed"] as const)(
  "a claimed check can finish %s with zero provider attempts without losing its first-send fence",
  async (status) => {
    const f = await workerNativeFixture(invocation);
    try {
      const owned = await f.create();
      const before = await f.db.rankCheck.findUniqueOrThrow({ where: { id: owned.check.id } });
      expect(before.attemptCount).toBe(1);
      expect(before.definitionExecutionToken).toBe(owned.scope.permit.token);
      // discardRankCheckActivity writes zero directly; failed persistence derives
      // zero from the actual empty-attempt contract when capture rejects before I/O.
      const attemptCount =
        status === "deferred"
          ? 0
          : deriveCheckAttemptSummary(null, "dataforseo", "failed").attemptCount;
      expect(attemptCount).toBe(0);
      const closed = await f.db.rankCheck.updateMany({
        where: { id: owned.check.id, status: "running" },
        data: { status, attemptCount, finishedAt: new Date() },
      });
      expect(closed.count).toBe(1);
      const after = await f.db.rankCheck.findUniqueOrThrow({ where: { id: owned.check.id } });
      expect(after.status).toBe(status);
      expect(after.attemptCount).toBe(0);
      expect(after.definitionExecutionToken).toBe(before.definitionExecutionToken);
      expect(after.definitionWorkflowId).toBe(before.definitionWorkflowId);
      expect(after.definitionExecutionPrincipal).toEqual(before.definitionExecutionPrincipal);
      expect(
        await f.db.$transaction((tx) => claimDefinitionPaidCall(tx, owned.check.id, false)),
      ).toBeNull();
      const dispatch = await f.client.query(
        "SELECT fenced_at FROM metering_paid_attempt_context WHERE namespace=$1 AND operation_id=$2",
        [f.namespace, owned.grant.operation.operationId],
      );
      expect(dispatch.rows[0].fenced_at).toBeNull();
    } finally {
      await f.close();
    }
  },
);

test("zero attempt count cannot recreate a first-send permit or rewrite the original worker claim", async () => {
  const f = await workerNativeFixture(invocation);
  try {
    const owned = await f.create();
    await f.db.rankCheck.update({ where: { id: owned.check.id }, data: { attemptCount: 0 } });
    // Even while status remains running, the immutable non-null token defeats the CAS.
    expect(
      await f.db.$transaction((tx) => claimDefinitionPaidCall(tx, owned.check.id, false)),
    ).toBeNull();
    for (const data of [
      { definitionExecutionToken: randomUUID() },
      { definitionWorkflowId: "another-worker" },
      { workflowRunId: "another-workflow-run" },
    ]) {
      await expect(f.db.rankCheck.update({ where: { id: owned.check.id }, data })).rejects.toThrow(
        "measurement_worker_claim_immutable",
      );
    }
    await expect(
      f.client.query(
        `UPDATE rank_checks SET "definitionExecutionPrincipal"=jsonb_set("definitionExecutionPrincipal",'{actorId}',to_jsonb($1::text)) WHERE id=$2`,
        [randomUUID(), owned.check.id],
      ),
    ).rejects.toThrow("measurement_worker_claim_immutable");
    const after = await f.db.rankCheck.findUniqueOrThrow({ where: { id: owned.check.id } });
    expect(after.definitionExecutionToken).toBe(owned.scope.permit.token);
    expect(after.definitionExecutionPrincipal).toEqual(owned.scope.permit.principal);
  } finally {
    await f.close();
  }
});
