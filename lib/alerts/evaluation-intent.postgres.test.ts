import { processPendingAlertEvaluationIntents } from "@/lib/alerts/evaluation-intent";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  cleanup,
  completedCheck,
  openEvaluationIntentDatabase,
  pendingProbe,
} from "@/lib/test/fixtures/evaluation-intent.postgres-test-fixture";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, key) {
        const db = store.db;
        if (!db) throw new Error("PostgreSQL client is not ready.");
        const value = db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  ),
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn(async () => undefined) }));

describeDatabase();

function describeDatabase() {
  let database: Awaited<ReturnType<typeof openEvaluationIntentDatabase>>;

  beforeAll(async () => {
    database = await openEvaluationIntentDatabase();
    store.db = database.client;
  }, 180_000);

  afterAll(async () => {
    store.db = undefined;
    if (database) await database.dispose();
  });

  it.each(["manual", "scheduled"] as const)(
    "processes one pending %s intent into exactly one alert and ignores a replay",
    async (trigger) => {
      const db = database.client;
      const fixture = await completedCheck(db, trigger);
      try {
        expect(await pendingProbe(db)).toBe(true);
        const recovered = await processPendingAlertEvaluationIntents();
        expect(recovered.failed).toBe(0);
        expect(recovered.processed).toBe(1);
        const alerts = await db.triggeredAlert.findMany({
          where: { rankCheckId: fixture.checkId },
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({
          deliveryState: trigger === "scheduled" ? "digest_pending" : "pending",
          keywordId: fixture.keywordId,
          ruleId: fixture.ruleId,
        });
        expect(
          await db.alertEvaluationIntent.findUnique({ where: { rankCheckId: fixture.checkId } }),
        ).toMatchObject({
          completedAt: expect.any(Date),
          state: "done",
        });
        expect(recovered.immediateAlertIds).toEqual(trigger === "scheduled" ? [] : [alerts[0]?.id]);
        await expect(processPendingAlertEvaluationIntents()).resolves.toEqual({
          failed: 0,
          immediateAlertIds: [],
          processed: 0,
        });
        expect(await db.triggeredAlert.count({ where: { rankCheckId: fixture.checkId } })).toBe(1);
        expect(await pendingProbe(db)).toBe(false);
      } finally {
        await cleanup(db, fixture);
      }
    },
  );

  it("keeps a later rule when an earlier alert was already stored", async () => {
    const db = database.client;
    const fixture = await completedCheck(db, "manual", { laterRule: true });
    await db.triggeredAlert.create({
      data: {
        afterPosition: 30,
        beforePosition: 3,
        keywordId: fixture.keywordId,
        payload: {},
        publicId: makePublicId("al"),
        rankCheckId: fixture.checkId,
        ruleId: fixture.ruleId,
      },
    });
    try {
      await processPendingAlertEvaluationIntents();
      const alerts = await db.triggeredAlert.findMany({
        orderBy: { ruleId: "asc" },
        where: { rankCheckId: fixture.checkId },
      });
      expect(alerts.map((alert) => alert.ruleId).sort()).toEqual(
        [fixture.ruleId, fixture.laterRuleId].sort(),
      );
      await processPendingAlertEvaluationIntents();
      expect(await db.triggeredAlert.count({ where: { rankCheckId: fixture.checkId } })).toBe(2);
      expect(
        await db.alertEvaluationIntent.findUnique({ where: { rankCheckId: fixture.checkId } }),
      ).toMatchObject({ state: "done" });
    } finally {
      await cleanup(db, fixture);
    }
  });
}
