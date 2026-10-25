import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { originalRecoveryAccount } from "@/lib/provider-evidence/dataforseo/account";
import {
  account,
  envelope,
  httpDouble,
} from "@/lib/provider-evidence/dataforseo/fixtures.test-support";
import { claimQueuedPersistenceLease } from "@/lib/rank-check/queued-persistence-lease";
import { persistFailedRankCheckInTransaction } from "@/lib/rank-check/runner-persistence";
import { markStaleRunningChecks } from "@/lib/rank-check/stale-checks";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureRecoveryCandidate, markRecoveryAttemptStopped } from "./capture";
import { assertRecoveryFixtureUrl } from "./fixture-url.test-support";
import { processRecoveryLookups, runRecoveryLookup } from "./job";
import { claimRecoveryIntent } from "./lease";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
  protectedRecoverySnapshot,
  recoveryFixture,
} from "./postgres.test-support";
import { previewProviderRecovery } from "./preview";
import { sweepRecoveryCandidates } from "./sweep";

const replay = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("Automatic paid resume planted");
  }),
);
vi.mock("@/lib/metering/recovery/execute", () => ({ processRecoveryCommands: replay }));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: vi.fn(async () => {}),
  publishNotificationCreated: vi.fn(),
}));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: vi.fn(),
  notifyRankCheckFailed: vi.fn(),
}));
const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("recovery hooks and invariants PostgreSQL", () => {
  beforeEach(() => {
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("PROVIDER_RECOVERY", "observe");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    expect(replay).not.toHaveBeenCalled();
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(async () => prisma.$disconnect());

  it("RE-2/4 real stale sweep stores candidate before closing and terminal sweep enqueues it", async () => {
    const f = await recoveryFixture();
    await markStaleRunningChecks({ now: f.now });
    expect(await prisma.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
      status: "failed",
      preRecoveryFinishedAt: f.now,
    });
    expect(
      await prisma.providerRecoveryCandidate.count({ where: { operationPk: f.operationPk } }),
    ).toBe(1);
    expect(
      await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
    ).toBe(0);
    const probe = vi.fn(async () => "workflow_failed" as const);
    await sweepRecoveryCandidates(probe);
    expect(probe).toHaveBeenCalledWith(f.check.id);
    expect(
      await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
    ).toBe(1);
  });
  it("RE-2/4 real failure persistence stores a durable candidate before failure closure", async () => {
    const f = await recoveryFixture();
    await prisma.$transaction((tx) =>
      persistFailedRankCheckInTransaction(tx, {
        existingRankCheckId: f.check.id,
        keywordId: f.keyword.id,
        keywordPublicId: f.keyword.publicId,
        projectId: f.project.id,
        provider: "dataforseo",
        error: "partial response",
      }),
    );
    expect(
      await prisma.providerRecoveryCandidate.count({ where: { operationPk: f.operationPk } }),
    ).toBe(1);
    expect(await prisma.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
      status: "failed",
      recoveryProvenance: expect.any(Object),
    });
    expect(
      await prisma.providerRecoveryIntent.count({ where: { operationPk: f.operationPk } }),
    ).toBe(0);
  });
  it("DV-5 default-off capture leaves legacy rows and both DM-2 fields null", async () => {
    const f = await recoveryFixture();
    vi.stubEnv("PROVIDER_RECOVERY", "off");
    await prisma.$transaction((tx) => captureRecoveryCandidate(tx, f.check.id));
    await markRecoveryAttemptStopped(f.check.id, "workflow_failed");
    const probe = vi.fn();
    expect(await sweepRecoveryCandidates(probe)).toEqual({ examined: 0 });
    expect(probe).not.toHaveBeenCalled();
    expect(
      await prisma.providerRecoveryCandidate.count({ where: { operationPk: f.operationPk } }),
    ).toBe(0);
    expect(await prisma.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
      preRecoveryFinishedAt: null,
      recoveryProvenance: null,
    });
  });
  it("RE-3 claim refusal discovers only earlier fenced attempt; refused unfenced operation stays untouched", async () => {
    const f = await recoveryFixture();
    await prisma.meteringOperation.create({
      data: {
        ...f.operation,
        budget_epochs: {},
        input: { provider: "dataforseo", operation: "rank_check" },
        warnings: [],
        alerts: [],
        operation_pk: `${f.operationPk}-refused`,
        operation_id: `${f.operationId}-refused`,
        paidAttemptContext: {
          create: {
            principal: "original-principal",
            context: { rankCheckId: f.check.id },
            dispatch_lease_id: "refused-unfenced",
          },
        },
      },
    });
    const before = await protectedRecoverySnapshot();
    await markRecoveryAttemptStopped(f.check.id, "non_retryable");
    expect(
      await prisma.providerRecoveryIntent.findMany({
        where: { candidate: { rankCheckId: f.check.id } },
        select: { operationPk: true },
      }),
    ).toEqual([{ operationPk: f.operationPk }]);
    expect(await protectedRecoverySnapshot()).toEqual(before);
  });
  it.each(["recovery_first", "persist_first"])(
    "RE-5 %s owns the shared lease exclusively",
    async (order) => {
      const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
      await markRecoveryAttemptStopped(f.check.id, "workflow_failed", true);
      const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
        where: { operationPk: f.operationPk },
      });
      const recovery = () => claimRecoveryIntent(intent.id);
      const persist = () =>
        prisma.$transaction((tx) => claimQueuedPersistenceLease(f.identity.queuedTaskId!, tx));
      if (order === "recovery_first") {
        expect(await recovery()).not.toBeNull();
        expect(await persist()).toBeNull();
      } else {
        expect(await persist()).not.toBeNull();
        expect(await recovery()).toBeNull();
      }
    },
  );
  it("RE-5 disabling lookup cannot release an already held recovery lease to persistReady", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    await markRecoveryAttemptStopped(f.check.id, "workflow_failed", true);
    const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
      where: { operationPk: f.operationPk },
    });
    expect(await claimRecoveryIntent(intent.id)).not.toBeNull();
    vi.stubEnv("PROVIDER_RECOVERY", "off");
    expect(
      await prisma.$transaction((tx) => claimQueuedPersistenceLease(f.identity.queuedTaskId!, tx)),
    ).toBeNull();
  });
  it("RE-2 concurrent fallback persistence promotes an already enqueued earlier attempt to accounting-only", async () => {
    const f = await recoveryFixture();
    await markRecoveryAttemptStopped(f.check.id, "workflow_completed");
    const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
      where: { operationPk: f.operationPk },
    });
    expect(intent.accountingOnly).toBe(false);
    const finishedAt = new Date();
    await Promise.all([
      prisma.$transaction((tx) => captureRecoveryCandidate(tx, f.check.id)),
      prisma.$transaction(async (tx) => {
        await tx.rankCheck.update({
          where: { id: f.check.id },
          data: { status: "completed", provider: "fallback", position: 7, finishedAt },
        });
        await captureRecoveryCandidate(tx, f.check.id);
      }),
    ]);
    expect(
      await prisma.providerRecoveryIntent.findUnique({ where: { id: intent.id } }),
    ).toMatchObject({ accountingOnly: true });
    expect(await prisma.rankCheck.findUnique({ where: { id: f.check.id } })).toMatchObject({
      status: "completed",
      provider: "fallback",
      position: 7,
      finishedAt,
    });
  });
  it("INV-1/6/11 full enqueue + lookup pass preserves financial, authority, fence, preference and notification contents", async () => {
    const f = await recoveryFixture({ queued: true, deadlineSeconds: -1 });
    await prisma.notificationPreference.create({
      data: { userId: f.user.id, projectId: f.project.id },
    });
    await prisma.notification.create({
      data: {
        publicId: makePublicId("ntf"),
        userId: f.user.id,
        projectId: f.project.id,
        type: "system",
        title: "Fixture unchanged",
      },
    });
    await prisma.providerOperationEvidence.create({
      data: {
        operationPk: f.operationPk,
        acceptance: "unconfirmed",
        fulfillment: "absent",
        accounting: "unknown",
      },
    });
    const before = await protectedRecoverySnapshot();
    await markRecoveryAttemptStopped(f.check.id, "workflow_cancelled", true);
    const intent = await prisma.providerRecoveryIntent.findFirstOrThrow({
      where: { operationPk: f.operationPk },
    });
    const response = envelope(40106, 0.002);
    response.tasks[0].id = `native-${f.operationId.slice(3)}`;
    const double = httpDouble([response]);
    const dependencies = {
      resolveAccount: async () => ({
        ...account,
        accountId: f.connection.id,
        credentialVersion: f.identity.providerCredentialVersion,
      }),
      transport: () => double.transport,
    };
    expect(await runRecoveryLookup(intent.id, dependencies)).toMatchObject({
      kind: "evidence",
      writeGateOpen: false,
    });
    expect(
      await prisma.providerRecoveryIntent.findUnique({ where: { id: intent.id } }),
    ).toMatchObject({ state: "scheduled", reason: "write_gate_closed" });
    await processRecoveryLookups(dependencies);
    await sweepRecoveryCandidates(async () => null);
    await previewProviderRecovery(fixtureNamespace);
    double.assertNoPaidRequests();
    expect(double.send).toHaveBeenCalledTimes(1);
    expect(await protectedRecoverySnapshot()).toEqual(before);
  });
  it("INV-3 real BYOK owner change keeps original credentials; credential rotation fails closed", async () => {
    const f = await recoveryFixture();
    const original = await originalRecoveryAccount(f.identity);
    expect(original?.credentialVersion).toBe(f.identity.providerCredentialVersion);
    const newOwner = await prisma.user.create({
      data: {
        publicId: makePublicId("usr"),
        email: `new-${f.user.email}`,
        name: "New fixture owner",
      },
    });
    await prisma.project.update({ where: { id: f.project.id }, data: { ownerId: newOwner.id } });
    expect(await originalRecoveryAccount(f.identity)).toEqual(original);
    await prisma.providerConnection.update({
      where: { id: f.connection.id },
      data: { credentialsEncrypted: null },
    });
    expect(await originalRecoveryAccount(f.identity)).toBeNull();
  });
});
