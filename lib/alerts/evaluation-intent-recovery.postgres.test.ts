import { processPendingAlertEvaluationIntents } from "@/lib/alerts/evaluation-intent";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  cleanup,
  completedCheck,
  openEvaluationIntentDatabase,
  rankCheckData,
  ruleFor,
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

  it("evaluates a check's own result and skips a stateful transition superseded by a newer check", async () => {
    const db = database.client;
    const fixture = await completedCheck(db, "manual");
    const mismatch = await ruleFor(db, fixture.projectId, "URL mismatch", {
      conditionType: "url_mismatch",
      dropPositions: null,
    });
    try {
      await db.keyword.update({
        data: { targetUrl: "https://example.com/wanted" },
        where: { id: fixture.keywordId },
      });
      await db.rankCheck.update({
        data: {
          position: 30,
          previousPosition: 3,
          rankingUrl: "https://example.com/other",
        },
        where: { id: fixture.checkId },
      });
      await db.rankCheck.create({
        data: rankCheckData(fixture.keywordId, new Date("2026-11-03T13:00:00.000Z"), {
          rankingUrl: "https://example.com/wanted",
        }),
      });
      await processPendingAlertEvaluationIntents();
      const alerts = await db.triggeredAlert.findMany({ where: { rankCheckId: fixture.checkId } });
      expect(alerts.map((alert) => alert.ruleId)).toEqual([fixture.ruleId]);
      expect(alerts.some((alert) => alert.ruleId === mismatch.id)).toBe(false);
    } finally {
      await cleanup(db, fixture);
    }
  });

  it("does not let an older clear resolve an incident from a newer check", async () => {
    const db = database.client;
    const fixture = await completedCheck(db, "manual", { laterRule: false });
    const mismatch = await ruleFor(db, fixture.projectId, "URL mismatch", {
      conditionType: "url_mismatch",
      dropPositions: null,
    });
    try {
      await db.keyword.update({
        data: { targetUrl: "https://example.com/wanted" },
        where: { id: fixture.keywordId },
      });
      await db.alertRule.delete({ where: { id: fixture.ruleId } });
      await db.rankCheck.update({
        data: {
          position: 4,
          previousPosition: 4,
          rankingUrl: "https://example.com/wanted",
        },
        where: { id: fixture.checkId },
      });
      const newer = await db.rankCheck.create({
        data: rankCheckData(fixture.keywordId, new Date("2026-11-03T13:00:00.000Z"), {
          rankingUrl: "https://example.com/other",
        }),
      });
      const open = await db.triggeredAlert.create({
        data: {
          afterPosition: 4,
          beforePosition: 4,
          keywordId: fixture.keywordId,
          payload: {},
          publicId: makePublicId("al"),
          rankCheckId: newer.id,
          ruleId: mismatch.id,
          status: "firing",
        },
      });
      await processPendingAlertEvaluationIntents();
      expect(await db.triggeredAlert.findUnique({ where: { id: open.id } })).toMatchObject({
        status: "firing",
      });
    } finally {
      await cleanup(db, fixture);
    }
  });

  it("evaluates recovery against the fast-path predecessor, not a later incomparable check", async () => {
    const db = database.client;
    const fixture = await completedCheck(db, "manual");
    const feature = await ruleFor(db, fixture.projectId, "Feature", {
      conditionType: "serp_feature",
      dropPositions: null,
      serpFeature: "featured snippet",
    });
    try {
      await db.alertRule.delete({ where: { id: fixture.ruleId } });
      const predecessor = await db.rankCheck.create({
        data: rankCheckData(fixture.keywordId, new Date("2026-11-03T10:00:00.000Z"), {
          raw: { serp_features: [] },
        }),
      });
      await db.rankCheck.create({
        data: rankCheckData(fixture.keywordId, new Date("2026-11-03T11:00:00.000Z"), {
          raw: { serp_features: ["featured snippet"] },
          requestedDepth: 10,
        }),
      });
      await db.rankCheck.update({
        data: {
          comparisonAllowed: true,
          position: 5,
          previousPosition: 5,
          raw: { serp_features: ["featured snippet"] },
          requestedDepth: 100,
        },
        where: { id: fixture.checkId },
      });
      await db.alertEvaluationIntent.update({
        data: { predecessorRankCheckId: predecessor.id },
        where: { rankCheckId: fixture.checkId },
      });
      await processPendingAlertEvaluationIntents();
      const alerts = await db.triggeredAlert.findMany({ where: { rankCheckId: fixture.checkId } });
      expect(alerts.map((alert) => alert.ruleId)).toEqual([feature.id]);
    } finally {
      await cleanup(db, fixture);
    }
  });

  it("does not compare when the stored check has no comparison flag", async () => {
    const db = database.client;
    const fixture = await completedCheck(db, "manual");
    try {
      await db.rankCheck.update({
        data: { comparisonAllowed: null },
        where: { id: fixture.checkId },
      });
      await processPendingAlertEvaluationIntents();
      expect(await db.triggeredAlert.count({ where: { rankCheckId: fixture.checkId } })).toBe(0);
    } finally {
      await cleanup(db, fixture);
    }
  });

  it("orders a never-leased intent ahead of due retries", async () => {
    const db = database.client;
    const fixture = await completedCheck(db, "manual");
    const retryIds: string[] = [];
    try {
      await db.alertEvaluationIntent.delete({ where: { rankCheckId: fixture.checkId } });
      for (let index = 0; index < 20; index += 1) {
        const check = await db.rankCheck.create({
          data: rankCheckData(fixture.keywordId, new Date(Date.UTC(2026, 10, 1, 0, index, 0))),
        });
        retryIds.push(check.id);
        await db.alertEvaluationIntent.create({
          data: {
            createdAt: new Date(Date.UTC(2026, 10, 1, 0, index, 0)),
            leaseUntil: new Date(Date.now() - 60_000),
            rankCheckId: check.id,
            state: "pending",
          },
        });
      }
      await db.rankCheck.update({
        data: { checkedAt: new Date("2026-11-02T12:00:00.000Z") },
        where: { id: fixture.checkId },
      });
      await db.alertEvaluationIntent.create({
        data: {
          createdAt: new Date("2026-11-03T12:00:00.000Z"),
          rankCheckId: fixture.checkId,
          state: "pending",
        },
      });
      await processPendingAlertEvaluationIntents({ limit: 20 });
      expect(
        await db.alertEvaluationIntent.findUnique({ where: { rankCheckId: fixture.checkId } }),
      ).toMatchObject({ state: "done" });
      const pending = await db.alertEvaluationIntent.findMany({
        where: { rankCheckId: { in: retryIds }, state: "pending" },
      });
      expect(pending.map((row) => row.rankCheckId)).toEqual([retryIds[19]]);
    } finally {
      await cleanup(db, fixture);
    }
  });
}
