import { prisma } from "@/lib/db/prisma";
import { getNotificationFeedForScope } from "@/lib/notifications/feed";
import { upsertNotification } from "@/lib/notifications/upsert";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { providerRecoveryScope } from "@/lib/provider-evidence/recovery/scope";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recomputeCheckSummary } from "./deliver";
import { date } from "./fixtures.test-support";
import {
  addMember,
  extraUsers,
  fixtureNow,
  preference,
  summaryFixture,
} from "./postgres.test-support";

const publish = vi.hoisted(() => vi.fn(async (_event: { kind: string }) => {}));
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: publish }));
const url = process.env.METERING_TEST_DATABASE_URL;
const options = { now: fixtureNow };
async function enqueue(f: Awaited<ReturnType<typeof summaryFixture>>, accountingOnly = false) {
  const candidate = await prisma.providerRecoveryCandidate.create({
    data: {
      ...providerRecoveryScope(),
      operationPk: f.operationPk,
      attemptId: f.attemptId,
      rankCheckId: f.check.id,
      accountingOnly,
      intent: { create: { operationPk: f.operationPk, attemptId: f.attemptId, accountingOnly } },
    },
  });
  return candidate;
}
describe.skipIf(!url)("check summary lifecycle PostgreSQL", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "off");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    publish.mockClear();
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    await prisma.user.deleteMany({ where: { id: { in: extraUsers.splice(0) } } });
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("CN-8 stale failure becomes under review in place and never marks a read summary unread", async () => {
    const f = await summaryFixture();
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { status: "failed" } });
    await recomputeCheckSummary(f.target, options);
    const row = await prisma.notification.findFirstOrThrow({ where: { projectId: f.project.id } });
    const readAt = date("07:01:00");
    await prisma.notification.update({ where: { id: row.id }, data: { readAt } });
    await enqueue(f);
    publish.mockClear();
    expect(await recomputeCheckSummary(f.target, options)).toBe(1);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      readAt,
      version: 2,
      payload: { counts: { under_review: 1, failed: 0, up: 0, down: 0 } },
    });
    expect(publish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "updated" }));
  });
  it("CN-8 under review is significant per recipient only without an actually delivered incident", async () => {
    const f = await summaryFixture();
    const member = await addMember(f.project.id);
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { status: "failed" } });
    await enqueue(f);
    const incident = await prisma.providerIncident.create({
      data: {
        projectId: f.project.id,
        cause: "fixture",
        operations: { create: { operationPk: f.operationPk } },
      },
    });
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    await upsertNotification({
      userId: member.id,
      projectId: f.project.id,
      type: "provider_incident",
      title: "provider_incident",
      idempotencyKey: `provider-incident:${incident.id}`,
      version: 1,
      payload: {},
    });
    vi.stubEnv("PROVIDER_RECOVERY", "off");
    await recomputeCheckSummary(f.target, options);
    const rows = await prisma.notification.findMany({
      where: { projectId: f.project.id, type: "scheduled_window_summary" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: f.user.id,
      payload: { counts: { under_review: 1, failed: 0 } },
    });
  });
  it.each(["none", "important", "all"] as const)(
    "CN-8 %s and cutoff retain intentional no-bell cases with incidents off",
    async (mode) => {
      const f = await summaryFixture(mode);
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { status: "failed", terminalPersistedAt: date("07:15:00") },
      });
      await enqueue(f);
      expect(await recomputeCheckSummary(f.target, options)).toBe(0);
      expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
      if (mode === "none") {
        await prisma.rankCheck.update({
          where: { id: f.check.id },
          data: { terminalPersistedAt: date("06:31:00") },
        });
        expect(await recomputeCheckSummary(f.target, options)).toBe(0);
      }
    },
  );
  it("CN-8 serializes collection with a concurrent fallback completion before projecting recovery", async () => {
    const f = await summaryFixture("all");
    await recomputeCheckSummary(f.target, options);
    const before = await prisma.notification.findFirstOrThrow({
      where: { projectId: f.project.id },
    });
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { status: "failed" } });
    await enqueue(f);
    let release!: () => void;
    let ready!: () => void;
    const entered = new Promise<void>((r) => {
      ready = r;
    });
    const finish = new Promise<void>((r) => {
      release = r;
    });
    const winner = prisma.$transaction(async (tx) => {
      await tx.rankCheck.update({ where: { id: f.check.id }, data: { status: "completed" } });
      ready();
      await finish;
    });
    await entered;
    const summary = recomputeCheckSummary(f.target, options);
    try {
      expect(
        await Promise.race([
          summary.then(() => "finished"),
          new Promise((r) => setTimeout(() => r("waiting"), 250)),
        ]),
      ).toBe("waiting");
    } finally {
      release();
      await winner;
    }
    expect(await summary).toBe(0);
    expect(await prisma.notification.findUnique({ where: { id: before.id } })).toEqual(before);
  });
  it("CN-8 waiting provenance is not enqueued; accounting-only and concurrent fallback winners change nothing", async () => {
    const f = await summaryFixture("all");
    await recomputeCheckSummary(f.target, options);
    const row = await prisma.notification.findFirstOrThrow({ where: { projectId: f.project.id } });
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { recoveryProvenance: { capturedAt: fixtureNow.toISOString() } },
    });
    await enqueue(f, true);
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
    // The winner is already persisted while enqueue has not yet promoted its old intent.
    await Promise.all([
      prisma.providerRecoveryIntent.updateMany({
        where: { operationPk: f.operationPk },
        data: { accountingOnly: false },
      }),
      prisma.providerRecoveryCandidate.updateMany({
        where: { operationPk: f.operationPk },
        data: { accountingOnly: false },
      }),
      recomputeCheckSummary(f.target, options),
    ]);
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
    expect(await prisma.notification.findUnique({ where: { id: row.id } })).toEqual(row);
  });
  it("CN-8 waiting provenance and accounting-only intents are never under review", async () => {
    const f = await summaryFixture("all");
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { status: "failed", recoveryProvenance: { capturedAt: fixtureNow.toISOString() } },
    });
    const candidate = await prisma.providerRecoveryCandidate.create({
      data: {
        ...providerRecoveryScope(),
        operationPk: f.operationPk,
        attemptId: f.attemptId,
        rankCheckId: f.check.id,
      },
    });
    await recomputeCheckSummary(f.target, options);
    const before = await prisma.notification.findFirstOrThrow({
      where: { projectId: f.project.id },
    });
    expect(before.payload).toMatchObject({ counts: { failed: 1, under_review: 0 } });
    await prisma.providerRecoveryCandidate.update({
      where: { id: candidate.id },
      data: {
        accountingOnly: true,
        intent: {
          create: { operationPk: f.operationPk, attemptId: f.attemptId, accountingOnly: true },
        },
      },
    });
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
    expect(await prisma.notification.findUnique({ where: { id: before.id } })).toEqual(before);
  });
  it.each([false, true])(
    "CN-9 reversal %s keeps read counts or withdraws unread and refreshes feed/unread/realtime",
    async (read) => {
      const f = await summaryFixture();
      await recomputeCheckSummary(f.target, options);
      const row = await prisma.notification.findFirstOrThrow({
        where: { projectId: f.project.id },
      });
      const readAt = read ? date("07:01:00") : null;
      if (readAt) await prisma.notification.update({ where: { id: row.id }, data: { readAt } });
      await prisma.rankCheck.update({ where: { id: f.check.id }, data: { position: 10 } });
      publish.mockClear();
      await recomputeCheckSummary(f.target, options);
      const result = await prisma.notification.findUniqueOrThrow({
        where: { id: row.id },
        include: { checkSummary: true },
      });
      expect(result.readAt).toEqual(readAt);
      expect(result.payload).toMatchObject({ counts: { down: 0, unchanged: 1 } });
      expect(result.withdrawnAt !== null).toBe(!read);
      expect(result.checkSummary).toMatchObject({ version: result.version, withdrawn: !read });
      const feed = await getNotificationFeedForScope(
        { userId: f.user.id, activeProjectId: f.project.id },
        { locale: "en" },
      );
      expect(feed.items).toHaveLength(read ? 1 : 0);
      expect(feed.unreadCount).toBe(0);
      expect(publish).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: read ? "updated" : "withdrawn" }),
      );
      const calls = publish.mock.calls.length;
      expect(await recomputeCheckSummary(f.target, options)).toBe(0);
      expect(publish.mock.calls).toHaveLength(calls);
    },
  );
  it("CN-9 All reversal never withdraws or resets readAt; restored rows never enter a new summary", async () => {
    const f = await summaryFixture("all");
    await recomputeCheckSummary(f.target, options);
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { position: 10 } });
    await recomputeCheckSummary(f.target, options);
    expect(
      await prisma.notification.findFirst({ where: { projectId: f.project.id } }),
    ).toMatchObject({ withdrawnAt: null, readAt: null, version: 2 });
    await prisma.notification.deleteMany({ where: { projectId: f.project.id } });
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { recoveryRestoredAt: fixtureNow },
    });
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
    await preference(f.user.id, f.project.id, "important");
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
  });
});
