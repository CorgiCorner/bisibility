import { prisma } from "@/lib/db/prisma";
import { account, httpDouble } from "@/lib/provider-evidence/dataforseo/fixtures.test-support";
import { decryptSecret } from "@/lib/providers/crypto";
import { RankCheckClosedBeforePersistenceError } from "@/lib/rank-check/persistence-errors";
import { claimQueuedPersistenceLease } from "@/lib/rank-check/queued-persistence-lease";
import { terminalizeLease } from "@/lib/rank-check/queued-result-finalization";
import { updateRunningRankCheck } from "@/lib/rank-check/runner-persistence-shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeOriginalRankAttempt,
  markRecoveryAttemptStopped,
  originalRankAttemptSnapshot,
} from "./capture";
import { assertRecoveryFixtureUrl } from "./fixture-url.test-support";
import { runRecoveryLookup } from "./job";
import { cleanRecoveryFixtures, fixtureNamespace, recoveryFixture } from "./postgres.test-support";
import { recoveryWriteGateOpen } from "./predicate";

function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("original attempt cancellation PostgreSQL", () => {
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
  afterAll(async () => prisma.$disconnect());
  it.each(["http", "runner_settlement"])(
    "RE-3 cancellation during %s reads evidence but waits for late original final persistence acknowledgment",
    async (phase) => {
      const f = await recoveryFixture();
      const http = barrier(),
        settlement = barrier(),
        settlementEntered = barrier();
      const context = () =>
        prisma.meteringPaidAttemptContext.findUniqueOrThrow({
          where: {
            namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
          },
        });
      const original = (async () => {
        await http.promise;
        settlementEntered.release();
        await settlement.promise;
        await expect(
          prisma.$transaction((tx) =>
            updateRunningRankCheck(tx, f.check.id, { status: "completed", position: 1 }),
          ),
        ).rejects.toBeInstanceOf(RankCheckClosedBeforePersistenceError);
        await acknowledgeOriginalRankAttempt(f.check.id, []);
      })();
      if (phase === "runner_settlement") {
        http.release();
        await settlementEntered.promise;
      }
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { status: "failed", finishedAt: f.now },
      });
      await markRecoveryAttemptStopped(f.check.id, "workflow_cancelled");
      const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
        where: { operationPk: f.operationPk },
      });
      const double = httpDouble([
        {
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  id: "late-original",
                  url: "v3/serp/google/organic/live/advanced",
                  metadata: JSON.parse(decryptSecret(f.identity.payloadEncrypted)),
                  cost: 0.002,
                },
              ],
            },
          ],
        },
      ]);
      expect(
        await runRecoveryLookup(intent.id, {
          resolveAccount: async () => ({
            ...account,
            accountId: f.connection.id,

            credentialVersion: f.identity.providerCredentialVersion,
          }),
          transport: () => double.transport,
        }),
      ).toMatchObject({ kind: "metadata_evidence", writeGateOpen: false });
      expect(recoveryWriteGateOpen(await context())).toBe(false);
      http.release();
      await settlementEntered.promise;
      expect(recoveryWriteGateOpen(await context())).toBe(false);
      settlement.release();
      await original;
      expect(recoveryWriteGateOpen(await context())).toBe(true);
      expect(await prisma.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
        status: "failed",
        position: null,
        finishedAt: f.now,
      });
      double.assertNoPaidRequests();
    },
  );
  it("write gate opens only at the original queued persistence lease finalizer", async () => {
    const f = await recoveryFixture({ queued: true });
    const lease = await prisma.$transaction((tx) =>
      claimQueuedPersistenceLease(f.identity.queuedTaskId!, tx),
    );
    expect(lease).not.toBeNull();
    await prisma.$transaction(terminalizeLease(lease!, "failed"));
    const context = await prisma.meteringPaidAttemptContext.findUniqueOrThrow({
      where: {
        namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
      },
    });
    expect(recoveryWriteGateOpen(context)).toBe(true);
  });
  it("RE-3 final inline settlement needs no nonexistent Temporal workflow", async () => {
    const f = await recoveryFixture();
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { workflowRunId: "inline-fixture" },
    });
    await acknowledgeOriginalRankAttempt(f.check.id, []);
    expect(
      await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
    ).toBe(1);
  });
  it("a different invocation cannot acknowledge an earlier fenced attempt", async () => {
    const f = await recoveryFixture();
    const preceding = await originalRankAttemptSnapshot(f.check.id);
    await acknowledgeOriginalRankAttempt(f.check.id, preceding);
    const context = await prisma.meteringPaidAttemptContext.findUniqueOrThrow({
      where: {
        namespace_operation_id: { namespace: fixtureNamespace, operation_id: f.operationId },
      },
    });
    expect(recoveryWriteGateOpen(context)).toBe(false);
  });
});
