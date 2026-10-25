import { prisma } from "@/lib/db/prisma";
import { deferQueuedRankCheckBatch } from "@/lib/rank-check/queued-lifecycle";
import {
  claimQueuedPersistenceLease,
  transitionQueuedPersistenceLease,
} from "@/lib/rank-check/queued-persistence-lease";
import { terminalizeLease } from "@/lib/rank-check/queued-result-finalization";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertRecoveryFixtureUrl } from "./fixture-url.test-support";
import { lockRecoveryTask } from "./lease";
import { cleanRecoveryFixtures, fixtureNamespace, recoveryFixture } from "./postgres.test-support";
import { recoveryWriteGateOpen } from "./predicate";
import { acknowledgeOriginalQueuedSubmission } from "./queued-completion";

vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn(async () => {}) }));
function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("queued original ownership PostgreSQL", () => {
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
  it("write gate: deadline cleanup that starts no collector preserves original submission acknowledgment", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    const task = await prisma.queuedRankCheckTask.update({
      where: { id: f.identity.queuedTaskId! },
      data: { providerTaskId: null, state: "ambiguous" },
    });
    await acknowledgeOriginalQueuedSubmission(task.batchId, []);
    const context = () =>
      prisma.meteringPaidAttemptContext.findUniqueOrThrow({
        where: {
          namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
        },
      });
    expect(recoveryWriteGateOpen(await context())).toBe(true);
    await prisma.queuedRankCheckTask.update({
      where: { id: task.id },
      data: { state: "ready", providerTaskId: "discovered-before-deadline" },
    });
    await deferQueuedRankCheckBatch(task.batchId, "Queue deadline reached.");
    expect(recoveryWriteGateOpen(await context())).toBe(true);
    expect(await prisma.queuedRankCheckTask.findUnique({ where: { id: task.id } })).toMatchObject({
      state: "deferred",
      persistenceLeaseOwner: null,
    });
  });
  it("write gate: acknowledgment waits for readiness binding and revalidates under the same task ownership lock", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    const task = await prisma.queuedRankCheckTask.update({
      where: { id: f.identity.queuedTaskId! },
      data: { providerTaskId: null, state: "ambiguous" },
    });
    const locked = barrier(),
      releaseRow = barrier();
    const binding = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM queued_rank_check_tasks WHERE id=${task.id} FOR UPDATE`;
      locked.release();
      await releaseRow.promise;
      await tx.queuedRankCheckTask.update({
        where: { id: task.id },
        data: { providerTaskId: "ready-native", state: "ready" },
      });
    });
    await locked.promise;
    const acknowledgment = acknowledgeOriginalQueuedSubmission(task.batchId, []);
    let first: string;
    try {
      first = await Promise.race([
        acknowledgment.then(() => "acknowledged"),
        new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 500)),
      ]);
    } finally {
      releaseRow.release();
    }
    await Promise.all([acknowledgment, binding]);
    expect(first).toBe("blocked");
    expect(await claimQueuedPersistenceLease(task.id)).not.toBeNull();
    const context = await prisma.meteringPaidAttemptContext.findUniqueOrThrow({
      where: {
        namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
      },
    });
    expect(recoveryWriteGateOpen(context)).toBe(false);
  });
  it("write gate: collector completion cannot acknowledge an original POST still in flight", async () => {
    const f = await recoveryFixture({ queued: true });
    await prisma.meteringPaidAttemptContext.updateMany({
      where: { operation_id: f.operationId },
      data: { submissionCompletedAt: null },
    });
    const lease = await claimQueuedPersistenceLease(f.identity.queuedTaskId!);
    expect(lease).not.toBeNull();
    await prisma.$transaction(terminalizeLease(lease!, "failed"));
    const context = () =>
      prisma.meteringPaidAttemptContext.findUniqueOrThrow({
        where: {
          namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
        },
      });
    expect(recoveryWriteGateOpen(await context())).toBe(false);
    const task = await prisma.queuedRankCheckTask.findUniqueOrThrow({
      where: { id: f.identity.queuedTaskId! },
    });
    await acknowledgeOriginalQueuedSubmission(task.batchId, []);
    expect(recoveryWriteGateOpen(await context())).toBe(true);
    expect((await context()).submissionCompletedAt).not.toBeNull();
  });
  it("write gate: deadline cleanup acknowledges a normally released pending collector", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    const task = await prisma.queuedRankCheckTask.findUniqueOrThrow({
      where: { id: f.identity.queuedTaskId! },
    });
    await acknowledgeOriginalQueuedSubmission(task.batchId, []);
    const lease = await claimQueuedPersistenceLease(task.id);
    expect(lease).not.toBeNull();
    await transitionQueuedPersistenceLease(lease!, ["persisting"], { state: "ready" });
    await deferQueuedRankCheckBatch(task.batchId, "Queue deadline reached.");
    const context = await prisma.meteringPaidAttemptContext.findUniqueOrThrow({
      where: {
        namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
      },
    });
    expect(recoveryWriteGateOpen(context)).toBe(true);
  });
  it("write gate: late POST and collector persistence share task then check lock order", async () => {
    const f = await recoveryFixture({ queued: true });
    const task = await prisma.queuedRankCheckTask.findUniqueOrThrow({
      where: { id: f.identity.queuedTaskId! },
    });
    const locked = barrier(),
      release = barrier();
    const collector = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM queued_rank_check_tasks WHERE id=${task.id} FOR UPDATE`;
      locked.release();
      await release.promise;
      await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${f.check.id} FOR UPDATE`;
    });
    await locked.promise;
    const finalizer = acknowledgeOriginalQueuedSubmission(task.batchId, []);
    await new Promise((resolve) => setTimeout(resolve, 500));
    release.release();
    await expect(Promise.all([collector, finalizer])).resolves.toBeDefined();
  });
  it("write gate: cleanup revalidates a stale submitted snapshot against a newly active collector", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    const task = await prisma.queuedRankCheckTask.update({
      where: { id: f.identity.queuedTaskId! },
      data: { state: "submitted" },
    });
    const locked = barrier(),
      proceed = barrier();
    const collector = prisma.$transaction(async (tx) => {
      await lockRecoveryTask(tx, task.id);
      locked.release();
      await proceed.promise;
      await tx.queuedRankCheckTask.update({ where: { id: task.id }, data: { state: "ready" } });
      return claimQueuedPersistenceLease(task.id, tx);
    });
    await locked.promise;
    const cleanup = deferQueuedRankCheckBatch(task.batchId, "Queue deadline reached.");
    let waiting = false;
    try {
      for (let i = 0; i < 50; i++) {
        const rows = await prisma.$queryRaw<
          Array<{ found: number }>
        >`SELECT 1 AS found FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`;
        if (rows.length) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      proceed.release();
    }
    const lease = await collector;
    await cleanup;
    expect(waiting).toBe(true);
    expect(lease).not.toBeNull();
    expect(
      await prisma.queuedRankCheckTask.findUniqueOrThrow({ where: { id: task.id } }),
    ).toMatchObject({ state: "persisting", persistenceLeaseOwner: lease!.owner });
    expect(await prisma.rankCheck.findUniqueOrThrow({ where: { id: f.check.id } })).toMatchObject({
      status: "running",
    });
    const context = await prisma.meteringPaidAttemptContext.findUniqueOrThrow({
      where: {
        namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
      },
    });
    expect(recoveryWriteGateOpen(context)).toBe(false);
  });
});
