import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recomputeCheckSummary, summaryKey } from "./deliver";
import { date } from "./fixtures.test-support";
import {
  addMember,
  extraUsers,
  fixtureNow,
  makeRun,
  preference,
  summaryFixture,
} from "./postgres.test-support";

const publish = vi.hoisted(() => vi.fn(async (_event: { kind: string }) => {}));
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: publish }));
const url = process.env.METERING_TEST_DATABASE_URL;
const options = { now: fixtureNow };
describe.skipIf(!url)("check summaries PostgreSQL delivery", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    publish.mockClear();
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    await prisma.user.deleteMany({ where: { id: { in: extraUsers.splice(0) } } });
    vi.unstubAllEnvs();
  });
  afterAll(() => prisma.$disconnect());
  it("CN-10 parallel workers create one row per recipient/window with one event and equal-content no-op", async () => {
    const f = await summaryFixture();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => recomputeCheckSummary(f.target, options)),
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    const rows = await prisma.notification.findMany({
      where: { projectId: f.project.id },
      include: { checkSummary: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 1,
      checkSummary: { version: 1, checkIds: [f.check.id], topN: 10, positionMove: 5 },
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
  });
  it("CN-10 waits on the PostgreSQL advisory lock before reading source state", async () => {
    const f = await summaryFixture();
    let unlock: (() => void) | undefined;
    let locked: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const holder = prisma.$transaction(async (tx) => {
      const key = summaryKey(f.target);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      locked!();
      await release;
      await tx.rankCheck.update({ where: { id: f.check.id }, data: { position: 10 } });
    });
    await ready;
    const delivery = recomputeCheckSummary(f.target, options);
    try {
      expect(
        await Promise.race([
          delivery.then(() => "finished"),
          new Promise((r) => setTimeout(() => r("waiting"), 250)),
        ]),
      ).toBe("waiting");
    } finally {
      unlock!();
      await holder;
    }
    expect(await delivery).toBe(0);
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
  });
  it("CN-3/CN-10 manual run spanning hours reaches only its requester, once under concurrency", async () => {
    const f = await summaryFixture();
    await addMember(f.project.id, "all");
    const run = await makeRun(f);
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { runId: run.id, trigger: "manual" },
    });
    await prisma.rankCheck.create({
      data: {
        publicId: makePublicId("check"),
        keywordId: f.keyword.id,
        runId: run.id,
        trigger: "manual",
        provider: "fixture",
        position: 10,
        checkedAt: date("04:00:00"),
        finishedAt: date("04:01:00"),
        terminalPersistedAt: date("04:01:00"),
        requestedDepth: 100,
        normalizationVersion: "v1",
      },
    });
    const target = { kind: "manual" as const, projectId: f.project.id, runId: run.id };
    await Promise.all(Array.from({ length: 5 }, () => recomputeCheckSummary(target, options)));
    const rows = await prisma.notification.findMany({
      where: { projectId: f.project.id },
      include: { checkSummary: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: f.user.id,
      idempotencyKey: `check-run:${run.id}`,
      type: "manual_run_summary",
    });
    expect(rows[0].checkSummary?.checkIds).toHaveLength(2);
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
    const anonymous = await makeRun(f, { requestedById: null });
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { runId: anonymous.id } });
    await prisma.notification.deleteMany({ where: { projectId: f.project.id } });
    expect(await recomputeCheckSummary({ ...target, runId: anonymous.id }, options)).toBe(0);
  });
  it("CN-3/CN-5 manual runs with only legacy or cutoff-late checks create no empty bell", async () => {
    const f = await summaryFixture("all");
    const run = await makeRun(f);
    const target = { kind: "manual" as const, projectId: f.project.id, runId: run.id };
    for (const terminalPersistedAt of [null, date("07:15:00")]) {
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { runId: run.id, terminalPersistedAt },
      });
      expect(await recomputeCheckSummary(target, options)).toBe(0);
    }
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
  });
  it.each(["api", "sdk", "cli", "mcp"])(
    "INV-8 %s creates zero summaries for direct and retry runs",
    async (source) => {
      const f = await summaryFixture("all");
      const parent = await makeRun(f, { source });
      const retry = await makeRun(f, { trigger: "retry", source: "app", parentRunId: parent.id });
      for (const run of [parent, retry]) {
        await prisma.rankCheck.update({ where: { id: f.check.id }, data: { runId: run.id } });
        expect(
          await recomputeCheckSummary(
            { kind: "manual", projectId: f.project.id, runId: run.id },
            options,
          ),
        ).toBe(0);
        expect(await recomputeCheckSummary(f.target, options)).toBe(0);
      }
      expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
    },
  );
  it("CN-5 write cutoff and late persistence are enforced independently", async () => {
    const f = await summaryFixture("all");
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { finishedAt: date("06:59:00"), terminalPersistedAt: date("07:05:00") },
    });
    expect(await recomputeCheckSummary(f.target, options)).toBe(1);
    const before = await prisma.notification.findFirstOrThrow({
      where: { projectId: f.project.id },
    });
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { position: 40 } });
    expect(await recomputeCheckSummary(f.target, { now: date("07:15:00") })).toBe(0);
    expect(await prisma.notification.findUnique({ where: { id: before.id } })).toEqual(before);
    await prisma.notification.deleteMany({ where: { id: before.id } });
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { terminalPersistedAt: date("07:15:00") },
    });
    expect(await recomputeCheckSummary(f.target, options)).toBe(0);
  });
  it("CN-7/CN-14 evaluates each member's setting and thresholds and current membership", async () => {
    const f = await summaryFixture();
    await prisma.rankCheck.update({ where: { id: f.check.id }, data: { position: 25 } });
    await prisma.rankCheck.update({ where: { id: f.baseline.id }, data: { position: 20 } });
    await addMember(f.project.id, "important", 10, 6);
    const all = await addMember(f.project.id, "all", 10, 6);
    await addMember(f.project.id, "none");
    const removed = await addMember(f.project.id, "all");
    await prisma.membership.deleteMany({ where: { projectId: f.project.id, userId: removed.id } });
    await recomputeCheckSummary(f.target, options);
    expect(
      (await prisma.notification.findMany({ where: { projectId: f.project.id } }))
        .map((n) => n.userId)
        .sort(),
    ).toEqual([f.user.id, all.id].sort());
    await prisma.notification.deleteMany({ where: { projectId: f.project.id } });
    await preference(f.user.id, f.project.id, "important", 20, 6);
    expect(await recomputeCheckSummary(f.target, options)).toBe(2);
  });
  it("CN-6/CN-7 a complete configured Top 20 absence crosses only a proven recipient boundary", async () => {
    const f = await summaryFixture();
    await preference(f.user.id, f.project.id, "important", 10, 100);
    await addMember(f.project.id, "important", 30, 100);
    await prisma.rankCheck.update({
      where: { id: f.check.id },
      data: { position: null, requestedDepth: 20 },
    });
    await prisma.rankCheck.update({
      where: { id: f.baseline.id },
      data: { position: 10, requestedDepth: 20 },
    });
    expect(await recomputeCheckSummary(f.target, options)).toBe(1);
    expect(
      await prisma.notification.findMany({ where: { projectId: f.project.id } }),
    ).toMatchObject([{ userId: f.user.id, payload: { counts: { down: 1 } } }]);
  });
  it("summaries deliver without activation configuration", async () => {
    const f = await summaryFixture("all");
    expect(await recomputeCheckSummary(f.target, options)).toBe(1);
    expect(publish).toHaveBeenCalledOnce();
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(1);
  });
});
