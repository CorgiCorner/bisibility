import { prisma } from "@/lib/db/prisma";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recomputeCheckSummary } from "./deliver";
import { date } from "./fixtures.test-support";
import { fixtureNow, preference, summaryFixture } from "./postgres.test-support";

vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: vi.fn() }));
const url = process.env.METERING_TEST_DATABASE_URL;
const options = { now: fixtureNow };
describe.skipIf(!url)("summary read state PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("CN-9 locks the unread decision against a concurrent reader", async () => {
    const f = await summaryFixture();
    await recomputeCheckSummary(f.target, options);
    const row = await prisma.notification.findFirstOrThrow({ where: { projectId: f.project.id } });
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { position: 10 } });
    let release!: () => void, ready!: () => void;
    const entered = new Promise<void>((r) => {
      ready = r;
    });
    const finish = new Promise<void>((r) => {
      release = r;
    });
    const readAt = date("07:01:00");
    const reader = prisma.$transaction(async (tx) => {
      await tx.notification.update({ where: { id: row.id }, data: { readAt } });
      ready();
      await finish;
    });
    await entered;
    const summary = recomputeCheckSummary(f.target, options);
    await new Promise((r) => setTimeout(r, 250));
    release();
    await reader;
    await summary;
    expect(await prisma.notification.findUnique({ where: { id: row.id } })).toMatchObject({
      readAt,
      withdrawnAt: null,
      payload: { counts: { unchanged: 1 } },
    });
  });
  it("CN-9 a later significant result or All selection revives the same row within cutoff without unread reset", async () => {
    const f = await summaryFixture();
    await recomputeCheckSummary(f.target, options);
    const row = await prisma.notification.findFirstOrThrow({ where: { projectId: f.project.id } });
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { position: 10 } });
    await recomputeCheckSummary(f.target, options);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).withdrawnAt,
    ).not.toBeNull();
    await preference(f.user.id, f.project.id, "all");
    await recomputeCheckSummary(f.target, options);
    expect(await prisma.notification.findUnique({ where: { id: row.id } })).toMatchObject({
      withdrawnAt: null,
      readAt: null,
    });
    expect(
      await prisma.checkNotificationSummary.findUnique({ where: { notificationId: row.id } }),
    ).toMatchObject({ withdrawn: false });
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
    await preference(f.user.id, f.project.id, "important");
    await recomputeCheckSummary(f.target, options);
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { position: 30 } });
    await recomputeCheckSummary(f.target, options);
    expect(
      await prisma.notification.findMany({ where: { projectId: f.project.id } }),
    ).toMatchObject([{ id: row.id, withdrawnAt: null, payload: { counts: { down: 1 } } }]);
  });
});
