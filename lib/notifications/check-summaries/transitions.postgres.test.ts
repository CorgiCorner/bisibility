import { prisma } from "@/lib/db/prisma";
import { notificationTransaction } from "@/lib/notifications/transaction";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { finalizeRankCheckRun } from "@/lib/rank-check/runs/finalize";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureNow, makeRun, summaryFixture } from "./postgres.test-support";

const publish = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: publish }));
const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("durable run finalization summary PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.setSystemTime(fixtureNow);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    publish.mockClear();
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  afterAll(() => prisma.$disconnect());
  it("finalization creates a requester summary only after commit; a rollback never delivers", async () => {
    const f = await summaryFixture();
    const created = await makeRun(f);
    const run = await prisma.rankCheckRun.update({
      where: { id: created.id },
      data: { status: "running", finishedAt: null, requestedCount: 1 },
    });
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { runId: run.id, trigger: "manual" },
    });
    await prisma.rankCheckRunItem.create({
      data: {
        runId: run.id,
        keywordId: f.keyword.id,
        rankCheckId: f.check.id,
        status: "completed",
      },
    });
    await expect(
      notificationTransaction(async (tx) => {
        expect((await finalizeRankCheckRun(tx, { now: fixtureNow, run })).finalized).toBe(true);
        expect(await tx.notification.count({ where: { projectId: f.project.id } })).toBe(0);
        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");
    expect(publish).not.toHaveBeenCalled();
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
    await notificationTransaction(async (tx) => {
      expect((await finalizeRankCheckRun(tx, { now: fixtureNow, run })).finalized).toBe(true);
      expect(await tx.notification.count({ where: { projectId: f.project.id } })).toBe(0);
    });
    expect(
      await prisma.notification.findMany({ where: { projectId: f.project.id } }),
    ).toMatchObject([{ userId: f.user.id, type: "manual_run_summary", version: 1 }]);
    expect(publish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "created" }));
  });
});
