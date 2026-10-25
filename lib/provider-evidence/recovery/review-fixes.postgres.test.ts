import { prisma } from "@/lib/db/prisma";
import { claimQueuedPersistenceLease } from "@/lib/rank-check/queued-persistence-lease";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureRecoveryCandidate } from "./capture";
import { assertRecoveryFixtureUrl } from "./fixture-url.test-support";
import { cleanRecoveryFixtures, fixtureNamespace, recoveryFixture } from "./postgres.test-support";
import { recoveryWriteGateOpen } from "./predicate";
import { acknowledgeOriginalQueuedSubmission, queuedSubmissionSnapshot } from "./queued-completion";
import { sweepRecoveryCandidates } from "./sweep";

const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("verified review corrections PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(async () => prisma.$disconnect());
  it("RE-4 retires a full page of resolved waiting candidates so the next unresolved candidate advances", async () => {
    const resolved = await recoveryFixture({ completed: true });
    const old = new Date(Date.now() - 86400000);
    const operations = Array.from({ length: 100 }, (_, i) => ({
      ...resolved.operation,
      operation_pk: `${resolved.operationPk}-${i}`,
      operation_id: `${resolved.operationId}-${i}`,
      budget_epochs: {},
      input: {},
      warnings: [],
      alerts: [],
    }));
    await prisma.meteringOperation.createMany({ data: operations });
    await prisma.meteringPaidAttemptContext.createMany({
      data: operations.map((op, i) => ({
        namespace: fixtureNamespace,
        operation_id: op.operation_id,
        principal: op.principal,
        dispatch_lease_id: `lease-${i}`,
        fenced_at: old,
        fenced_at_iso: old.toISOString(),
        context: { rankCheckId: resolved.check.id },
      })),
    });
    await prisma.providerOperationEvidence.createMany({
      data: operations.map((op) => ({
        operationPk: op.operation_pk,
        acceptance: "accepted",
        fulfillment: "complete",
        accounting: "measured",
        recoveryState: "waiting_for_attempt_end",
      })),
    });
    await prisma.providerRecoveryCandidate.createMany({
      data: operations.map((op, i) => ({
        namespace: fixtureNamespace,
        instanceId: resolved.identity.instanceId,
        operationPk: op.operation_pk,
        attemptId: `lease-${i}`,
        rankCheckId: resolved.check.id,
        createdAt: old,
        updatedAt: old,
      })),
    });
    const unresolved = await recoveryFixture();
    await prisma.$transaction((tx) => captureRecoveryCandidate(tx, unresolved.check.id));
    const probe = vi.fn(async () => "workflow_failed" as const);
    await sweepRecoveryCandidates(probe);
    await sweepRecoveryCandidates(probe);
    expect(
      await prisma.providerRecoveryCandidate.count({ where: { rankCheckId: resolved.check.id } }),
    ).toBeLessThan(2);
    expect(
      await prisma.providerRecoveryIntent.count({ where: { operationPk: unresolved.operationPk } }),
    ).toBe(1);
  });
  it("write gate: original ambiguous submission finishes after terminal closure, but a retried caller cannot acknowledge it", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    const task = await prisma.queuedRankCheckTask.update({
      where: { id: f.identity.queuedTaskId! },
      data: { providerTaskId: null, state: "deferred" },
    });
    const batchId = task.batchId;
    const context = () =>
      prisma.meteringPaidAttemptContext.findUniqueOrThrow({
        where: {
          namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
        },
      });
    const preceding = await queuedSubmissionSnapshot(batchId);
    await acknowledgeOriginalQueuedSubmission(batchId, preceding);
    expect(recoveryWriteGateOpen(await context())).toBe(false);
    await acknowledgeOriginalQueuedSubmission(batchId, []);
    expect(recoveryWriteGateOpen(await context())).toBe(true);
    // Discovery may later provide an ID; original collection closes the gate before I/O.
    await prisma.queuedRankCheckTask.update({
      where: { id: task.id },
      data: { state: "ready", providerTaskId: "discovered-native" },
    });
    vi.stubEnv("PROVIDER_RECOVERY", "off");
    const lease = await prisma.$transaction((tx) => claimQueuedPersistenceLease(task.id, tx));
    expect(lease).not.toBeNull();
    expect(recoveryWriteGateOpen(await context())).toBe(false);
  });
});
