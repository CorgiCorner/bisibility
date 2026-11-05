import { prisma } from "@/lib/db/prisma";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
  recoveryFixture,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimQueuedPersistenceLease } from "./queued-persistence-lease";
import { terminalizeLease } from "./queued-result-finalization";
import {
  QUEUED_SOURCE_FAILED_RETENTION_MS,
  QUEUED_SOURCE_SWEEP_PAGE_SIZE,
  sweepExpiredQueuedSourceEvidence,
} from "./queued-source-retention";
import { QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } from "./queued-source-schema";

vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn(async () => {}) }));

const url = process.env.METERING_TEST_DATABASE_URL;
const DAY = 86_400_000;

function evidence(
  rankCheckId: string,
  id: string,
  overrides: { schemaVersion?: number; expiresAt?: Date; kind?: "partial" | "unresolved" } = {},
) {
  return {
    id: `${rankCheckId}:${id}`,
    namespace: fixtureNamespace,
    instanceId: "fixture",
    rankCheckId,
    kind: overrides.kind ?? "unresolved",
    schemaVersion: overrides.schemaVersion ?? QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION,
    payloadEncrypted: "synthetic",
    identityHash: id,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * DAY),
  } as const;
}

async function claimedCheck() {
  const fixture = await recoveryFixture({ queued: true });
  const taskId = fixture.identity.queuedTaskId as string;
  const lease = await prisma.$transaction((tx) => claimQueuedPersistenceLease(taskId, tx));
  if (!lease) throw new Error("Fixture lease was not claimed.");
  const rankCheckId = fixture.check.id;
  await prisma.providerPartialEvidence.createMany({
    data: [
      evidence(rankCheckId, "source"),
      evidence(rankCheckId, "resolution:1"),
      // Recovery partial evidence for the same check belongs to another mechanism.
      evidence(rankCheckId, "recovery", { schemaVersion: 2 }),
    ],
  });
  return { lease, rankCheckId, taskId };
}

const rowsOf = (rankCheckId: string) =>
  prisma.providerPartialEvidence.findMany({
    orderBy: { id: "asc" },
    select: { id: true, schemaVersion: true, expiresAt: true },
    where: { rankCheckId },
  });

describe.skipIf(!url)("queued source retention on the migrated schema", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(async () => prisma.$disconnect());

  it("deletes the retained source with the transaction that completes the check", async () => {
    const { lease, rankCheckId, taskId } = await claimedCheck();
    await prisma.$transaction(terminalizeLease(lease, "completed"));
    expect(await rowsOf(rankCheckId)).toEqual([
      expect.objectContaining({ id: `${rankCheckId}:recovery`, schemaVersion: 2 }),
    ]);
    expect(await prisma.queuedRankCheckTask.findUnique({ where: { id: taskId } })).toMatchObject({
      state: "completed",
    });
  });

  it("keeps a failed check's retained source for thirty days", async () => {
    const { lease, rankCheckId } = await claimedCheck();
    const recoveryExpiry = (await rowsOf(rankCheckId)).find(
      (row) => row.schemaVersion === 2,
    )?.expiresAt;
    const before = Date.now();
    await prisma.$transaction(terminalizeLease(lease, "failed"));
    const after = Date.now();
    const rows = await rowsOf(rankCheckId);
    expect(rows).toHaveLength(3);
    for (const row of rows.filter((value) => value.schemaVersion !== 2)) {
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + QUEUED_SOURCE_FAILED_RETENTION_MS,
      );
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
        after + QUEUED_SOURCE_FAILED_RETENTION_MS,
      );
    }
    expect(rows.find((row) => row.schemaVersion === 2)?.expiresAt).toEqual(recoveryExpiry);
  });

  it("sweeps expired retained sources in bounded pages and leaves other evidence", async () => {
    const fixture = await recoveryFixture({ queued: true });
    const rankCheckId = fixture.check.id;
    const expired = new Date(Date.now() - DAY);
    await prisma.providerPartialEvidence.createMany({
      data: [
        ...Array.from({ length: QUEUED_SOURCE_SWEEP_PAGE_SIZE + 1 }, (_, index) =>
          evidence(rankCheckId, `expired-${index}`, { expiresAt: expired }),
        ),
        evidence(rankCheckId, "current"),
        evidence(rankCheckId, "expired-recovery", { expiresAt: expired, schemaVersion: 2 }),
        evidence(rankCheckId, "expired-partial", { expiresAt: expired, kind: "partial" }),
      ],
    });

    const first = await sweepExpiredQueuedSourceEvidence();
    expect(first).toEqual({ deleted: QUEUED_SOURCE_SWEEP_PAGE_SIZE, hasMore: true });
    let page = await sweepExpiredQueuedSourceEvidence();
    while (page.hasMore) page = await sweepExpiredQueuedSourceEvidence();
    expect((await rowsOf(rankCheckId)).map((row) => row.id)).toEqual([
      `${rankCheckId}:current`,
      `${rankCheckId}:expired-partial`,
      `${rankCheckId}:expired-recovery`,
    ]);
  });
});
