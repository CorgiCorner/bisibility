import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
vi.mock("@/lib/alerts/evaluate", () => ({ evaluateKeywordAlerts: vi.fn() }));

import { recordAlertEvaluationIntent } from "@/lib/alerts/evaluation-intent";

type IntentRow = {
  attempts: number;
  completedAt: Date | null;
  leaseUntil: Date | null;
  predecessorRankCheckId: string | null;
  rankCheckId: string;
  state: string;
};

function memoryTx(rows: Map<string, IntentRow>) {
  return {
    alertEvaluationIntent: {
      create: async ({ data }: { data: Partial<IntentRow> & { rankCheckId: string } }) => {
        const row: IntentRow = {
          attempts: 0,
          completedAt: null,
          leaseUntil: null,
          predecessorRankCheckId: data.predecessorRankCheckId ?? null,
          rankCheckId: data.rankCheckId,
          state: data.state ?? "pending",
        };
        rows.set(row.rankCheckId, row);
        return row;
      },
      findUnique: async ({ where }: { where: { rankCheckId: string } }) =>
        rows.get(where.rankCheckId) ?? null,
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<IntentRow>;
        where: { rankCheckId: string; state?: string };
      }) => {
        const row = rows.get(where.rankCheckId);
        if (!row || (where.state && row.state !== where.state)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Partial<IntentRow> & { rankCheckId: string };
        update: Partial<IntentRow>;
        where: { rankCheckId: string };
      }) => {
        const row = rows.get(where.rankCheckId);
        if (!row) {
          const created: IntentRow = {
            attempts: 0,
            completedAt: null,
            leaseUntil: null,
            predecessorRankCheckId: create.predecessorRankCheckId ?? null,
            rankCheckId: create.rankCheckId,
            state: create.state ?? "pending",
          };
          rows.set(created.rankCheckId, created);
          return created;
        }
        Object.assign(row, update);
        return row;
      },
    },
  };
}

describe("recordAlertEvaluationIntent", () => {
  let rows: Map<string, IntentRow>;

  beforeEach(() => {
    rows = new Map();
  });

  it("keeps attempts and a failed state when the same check is persisted again", async () => {
    const completedAt = new Date("2026-11-03T12:00:00.000Z");
    rows.set("check_1", {
      attempts: 5,
      completedAt,
      leaseUntil: null,
      predecessorRankCheckId: "check_old",
      rankCheckId: "check_1",
      state: "failed",
    });

    await recordAlertEvaluationIntent(memoryTx(rows) as never, "check_1", "check_new");

    expect(rows.get("check_1")).toEqual({
      attempts: 5,
      completedAt,
      leaseUntil: null,
      predecessorRankCheckId: "check_old",
      rankCheckId: "check_1",
      state: "failed",
    });
  });

  it("keeps a done intent from returning to pending", async () => {
    const completedAt = new Date("2026-11-03T12:05:00.000Z");
    rows.set("check_1", {
      attempts: 1,
      completedAt,
      leaseUntil: null,
      predecessorRankCheckId: "check_old",
      rankCheckId: "check_1",
      state: "done",
    });

    await recordAlertEvaluationIntent(memoryTx(rows) as never, "check_1", "check_new");

    expect(rows.get("check_1")).toMatchObject({
      attempts: 1,
      completedAt,
      state: "done",
    });
  });

  it("keeps backoff attempts when a pending intent is persisted again", async () => {
    const leaseUntil = new Date("2026-11-03T12:10:00.000Z");
    rows.set("check_1", {
      attempts: 2,
      completedAt: null,
      leaseUntil,
      predecessorRankCheckId: "check_old",
      rankCheckId: "check_1",
      state: "pending",
    });

    await recordAlertEvaluationIntent(memoryTx(rows) as never, "check_1", "check_new");

    expect(rows.get("check_1")).toMatchObject({
      attempts: 2,
      leaseUntil,
      predecessorRankCheckId: "check_new",
      state: "pending",
    });
  });
});
