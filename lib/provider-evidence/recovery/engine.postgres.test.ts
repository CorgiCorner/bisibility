import { prisma } from "@/lib/db/prisma";
import { claimQueuedPersistenceLease } from "@/lib/rank-check/queued-persistence-lease";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeOriginalRankAttempt,
  captureRecoveryCandidate,
  markRecoveryAttemptStopped,
} from "./capture";
import { enqueueWaitingRecovery } from "./enqueue";
import { assertRecoveryFixtureUrl } from "./fixture-url.test-support";
import { claimRecoveryIntent, finishRecoveryLookup } from "./lease";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
  protectedRecoverySnapshot,
  recoveryFixture,
} from "./postgres.test-support";
import { recoveryWriteGateOpen } from "./predicate";
import { previewProviderRecovery, readOnlyRecoveryTransaction } from "./preview";

const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("provider recovery PostgreSQL", () => {
  beforeEach(() => {
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([3600, 1234])(
    "RE-1 RE-4 DM-2 persists waiting before close; honors %is and polling stop",
    async (seconds) => {
      const f = await recoveryFixture({ queued: true, deadlineSeconds: seconds });
      await prisma.$transaction((tx) =>
        captureRecoveryCandidate(
          tx,
          f.check.id,
          { stopReason: "workflow_failed", finishedAt: f.now },
          f.now,
        ),
      );
      expect(
        await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
      ).toBe(0);
      expect(
        await prisma.providerOperationEvidence.findUnique({
          where: { operationPk: f.operationPk },
        }),
      ).toMatchObject({ recoveryState: "waiting_for_attempt_end" });
      const waiting = await prisma.rankCheck.findUniqueOrThrow({ where: { id: f.check.id } });
      expect(waiting.status).toBe("running");
      expect(waiting.preRecoveryFinishedAt).toEqual(f.now);
      expect(waiting.recoveryProvenance).not.toBeNull();
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { status: "failed", finishedAt: f.now },
      });
      const deadline = new Date(f.now.getTime() + seconds * 1000);
      await prisma.$transaction((tx) => enqueueWaitingRecovery(tx, f.check.id, deadline));
      expect(
        await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
      ).toBe(0);
      await prisma.$transaction((tx) =>
        captureRecoveryCandidate(tx, f.check.id, { pollingStopped: true }, deadline),
      );
      expect(
        await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
      ).toBe(1);
    },
  );
  it.each(["delayed_start", "stale_closure", "activity_timeout", "retry"])(
    "RE-3/4 %s waits durably and enqueues once at actual stop",
    async () => {
      const f = await recoveryFixture();
      await prisma.$transaction((tx) =>
        captureRecoveryCandidate(tx, f.check.id, { finishedAt: f.now }),
      );
      expect(
        await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
      ).toBe(0);
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { status: "failed", finishedAt: f.now },
      });
      await markRecoveryAttemptStopped(f.check.id, "retries_exhausted");
      await markRecoveryAttemptStopped(f.check.id, "retries_exhausted");
      expect(
        await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
      ).toBe(1);
    },
  );
  it.each(["http", "runner_settlement"])(
    "RE-3 cancelled during %s allows reads while late original keeps write gate closed",
    async () => {
      const f = await recoveryFixture();
      await markRecoveryAttemptStopped(f.check.id, "workflow_cancelled");
      expect(
        await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
      ).toBe(1);
      let context = await prisma.meteringPaidAttemptContext.findUniqueOrThrow({
        where: {
          namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
        },
      });
      expect(recoveryWriteGateOpen(context)).toBe(false);
      const lease = await claimRecoveryIntent(
        (
          await prisma.providerRecoveryIntent.findFirstOrThrow({
            where: { operationPk: f.operationPk },
          })
        ).id,
      );
      expect(lease).not.toBeNull();
      await acknowledgeOriginalRankAttempt(f.check.id, []);
      context = await prisma.meteringPaidAttemptContext.findUniqueOrThrow({
        where: {
          namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
        },
      });
      expect(recoveryWriteGateOpen(context)).toBe(true);
    },
  );
  it.each([{ fenced: false }, { state: "released" }])(
    "RE-3 excluded attempt %j never writes recovery rows or calls enqueue seam",
    async (options) => {
      const f = await recoveryFixture(options);
      const before = await protectedRecoverySnapshot();
      await markRecoveryAttemptStopped(f.check.id, "workflow_failed");
      const seam = vi.fn();
      await prisma.$transaction((tx) => enqueueWaitingRecovery(tx, f.check.id, new Date(), seam));
      expect(seam).not.toHaveBeenCalled();
      expect(
        await prisma.providerRecoveryCandidate.count({ where: { operationPk: f.operationPk } }),
      ).toBe(0);
      expect(await protectedRecoverySnapshot()).toEqual(before);
    },
  );
  it("RE-2 measured live partial enters; fenced measured success does not", async () => {
    const f = await recoveryFixture();
    await prisma.providerOperationEvidence.create({
      data: {
        operationPk: f.operationPk,
        acceptance: "accepted",
        fulfillment: "partial",
        accounting: "measured",
      },
    });
    await markRecoveryAttemptStopped(f.check.id, "non_retryable");
    expect(
      await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
    ).toBe(1);
    await prisma.providerRecoveryIntent.deleteMany({ where: { operationPk: f.operationPk } });
    await prisma.providerRecoveryCandidate.deleteMany({ where: { operationPk: f.operationPk } });
    await prisma.providerOperationEvidence.update({
      where: { operationPk: f.operationPk },
      data: { fulfillment: "complete" },
    });
    await markRecoveryAttemptStopped(f.check.id, "workflow_completed");
    expect(
      await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
    ).toBe(0);
  });
  it("RE-2 RE-5 concurrent fallback completion creates one accounting-only intent and one enqueue event without changing winner", async () => {
    const f = await recoveryFixture({ completed: true });
    const before = await prisma.rankCheck.findUnique({ where: { id: f.check.id } });
    await prisma.$transaction((tx) => captureRecoveryCandidate(tx, f.check.id));
    await prisma.providerRecoveryCandidate.updateMany({
      where: { operationPk: f.operationPk },
      data: { stopReason: "workflow_completed" },
    });
    const seam = vi.fn(async () => {});
    await Promise.all(
      Array.from({ length: 5 }, () =>
        prisma.$transaction((tx) => enqueueWaitingRecovery(tx, f.check.id, new Date(), seam)),
      ),
    );
    expect(seam).toHaveBeenCalledTimes(1);
    expect(
      await prisma.providerRecoveryIntent.findFirst({ where: { operationPk: f.operationPk } }),
    ).toMatchObject({ accountingOnly: true });
    expect(await prisma.rankCheck.findUnique({ where: { id: f.check.id } })).toEqual(before);
  });
  it("RE-2 completed fallback discovery never enqueues its measured winner without a dispatch identity", async () => {
    const f = await recoveryFixture({ completed: true });
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { provider: "serpapi" } });
    const winnerPk = `${f.operationPk}-winner`;
    await prisma.meteringOperation.create({
      data: {
        ...f.operation,
        operation_pk: winnerPk,
        operation_id: `${f.operationId}-winner`,
        state: "settled",
        budget_epochs: {},
        input: { provider: "serpapi" },
        warnings: [],
        alerts: [],
        paidAttemptContext: {
          create: {
            principal: "original-principal",
            context: { rankCheckId: f.check.id },
            dispatch_lease_id: "winner",
            fenced_at: f.now,
            fenced_at_iso: f.now.toISOString(),
          },
        },
        receipts: {
          create: {
            receipt_pk: `receipt-${winnerPk}`,
            receipt_id: "winner",
            body: { providerRequestId: "native-winner" },
            occurred_at: f.now,
            recorded_at: f.now,
            cost_units: 10n,
            cost_certainty: "measured",
            sequence: 1,
            measurements: {
              create: { unit: "searches", value: 1, scale: 0, certainty: "measured" },
            },
          },
        },
      },
    });
    const before = await protectedRecoverySnapshot();
    const winner = await prisma.rankCheck.findUnique({ where: { id: f.check.id } });
    await markRecoveryAttemptStopped(f.check.id, "workflow_completed");
    expect(
      await prisma.providerRecoveryIntent.findMany({
        where: { candidate: { rankCheckId: f.check.id } },
        select: { operationPk: true },
      }),
    ).toEqual([{ operationPk: f.operationPk }]);
    expect(await prisma.rankCheck.findUnique({ where: { id: f.check.id } })).toEqual(winner);
    expect(await protectedRecoverySnapshot()).toEqual(before);
  });
  it("RE-5 real concurrent workers claim one lease and commit one outcome", async () => {
    const f = await recoveryFixture();
    await markRecoveryAttemptStopped(f.check.id, "workflow_failed");
    const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
      where: { operationPk: f.operationPk },
    });
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimRecoveryIntent(intent.id)),
    );
    const leases = claims.filter((claim) => claim !== null);
    expect(leases).toHaveLength(1);
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => finishRecoveryLookup(leases[0]!, "classification_only")),
    );
    expect(outcomes.reduce((sum, row) => sum + row.count, 0)).toBe(1);
  });
  it("RE-5 persistReady and recovery lease are mutually exclusive on PostgreSQL", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    await markRecoveryAttemptStopped(f.check.id, "workflow_failed", true);
    const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
      where: { operationPk: f.operationPk },
    });
    const claims = await Promise.all([
      claimRecoveryIntent(intent.id),
      prisma.$transaction((tx) => claimQueuedPersistenceLease(f.identity.queuedTaskId!, tx)),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it("RE-13 read-only transaction rejects INSERT UPDATE DELETE and preview leaves protected rows unchanged", async () => {
    const f = await recoveryFixture();
    const before = await protectedRecoverySnapshot();
    for (const sql of [
      `INSERT INTO provider_operation_evidence ("operationPk", "createdAt", "updatedAt") VALUES ('planted',now(),now())`,
      `UPDATE metering_operation SET state='released' WHERE namespace='${fixtureNamespace}'`,
      `DELETE FROM notification_preferences WHERE false`,
    ])
      await expect(readOnlyRecoveryTransaction((tx) => tx.$executeRawUnsafe(sql))).rejects.toThrow(
        /read.only/i,
      );
    expect(await previewProviderRecovery(fixtureNamespace)).toMatchObject({
      providerCalls: 0,
      writes: 0,
      providerAccessDenied: true,
      cases: [{ operationPk: f.operationPk }],
    });
    expect(await protectedRecoverySnapshot()).toEqual(before);
  });
});
