import { beforeEach, describe, expect, it, vi } from "vitest";

type IntentRow = {
  attempts: number;
  completedAt: Date | null;
  createdAt: Date;
  leaseUntil: Date | null;
  rankCheckId: string;
  state: string;
};

type LeaseFilter = { lt?: Date } | Date | null;
type IntentWhere = {
  OR?: Array<{ leaseUntil?: LeaseFilter }>;
  attempts?: number;
  leaseUntil?: LeaseFilter;
  rankCheckId?: string;
  state?: string;
};

const BACKOFF_BASE_MS = 30_000;
const MAX_ATTEMPTS = 5;
const intents = new Map<string, IntentRow>();
const notifyOps = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/ops/notify", () => ({ notifyOps }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    alertEvaluationIntent: {
      findMany: vi.fn(
        async ({
          orderBy,
          take,
          where,
        }: {
          orderBy?: Array<Record<string, unknown>> | Record<string, unknown>;
          take?: number;
          where?: IntentWhere;
        }) => {
          const rows = [...intents.values()].filter((row) => rowMatches(row, where));
          rows.sort((left, right) => compareIntents(left, right, orderBy));
          return (typeof take === "number" ? rows.slice(0, take) : rows).map((row) => ({
            rankCheckId: row.rankCheckId,
          }));
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { rankCheckId: string } }) => {
        return intents.get(where.rankCheckId) ?? null;
      }),
      updateMany: vi.fn(
        async ({ data, where }: { data: Partial<IntentRow>; where: IntentWhere }) => {
          let count = 0;
          for (const row of intents.values()) {
            if (!rowMatches(row, where)) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
  },
}));
vi.mock("@/lib/alerts/evaluate", () => ({ evaluateKeywordAlerts: vi.fn() }));

import { processPendingAlertEvaluationIntents } from "@/lib/alerts/evaluation-intent";

function leaseMatches(row: IntentRow, filter: LeaseFilter | undefined) {
  if (filter === undefined) return true;
  if (filter === null) return row.leaseUntil === null;
  if (filter instanceof Date) return row.leaseUntil?.getTime() === filter.getTime();
  const cutoff = filter.lt;
  if (!cutoff) return false;
  return row.leaseUntil !== null && row.leaseUntil.getTime() < cutoff.getTime();
}

function rowMatches(row: IntentRow, where: IntentWhere | undefined) {
  if (!where) return true;
  if (where.rankCheckId && row.rankCheckId !== where.rankCheckId) return false;
  if (where.state && row.state !== where.state) return false;
  if (typeof where.attempts === "number" && row.attempts !== where.attempts) return false;
  if (where.leaseUntil !== undefined && !leaseMatches(row, where.leaseUntil)) return false;
  if (!where.OR) return true;
  return where.OR.some((entry) => leaseMatches(row, entry.leaseUntil));
}

function compareIntents(
  left: IntentRow,
  right: IntentRow,
  orderBy: Array<Record<string, unknown>> | Record<string, unknown> | undefined,
) {
  const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  for (const order of orders) {
    const leaseOrder = order.leaseUntil as { nulls?: string; sort?: string } | undefined;
    if (leaseOrder) {
      const leftMissing = left.leaseUntil === null;
      const rightMissing = right.leaseUntil === null;
      if (leftMissing !== rightMissing) {
        const nullsFirst = (leaseOrder.nulls ?? "last") === "first";
        if (leftMissing) return nullsFirst ? -1 : 1;
        return nullsFirst ? 1 : -1;
      }
      if (left.leaseUntil && right.leaseUntil) {
        const diff = left.leaseUntil.getTime() - right.leaseUntil.getTime();
        if (diff !== 0) return leaseOrder.sort === "desc" ? -diff : diff;
      }
    }
    if (order.createdAt) {
      const diff = left.createdAt.getTime() - right.createdAt.getTime();
      if (diff !== 0) return order.createdAt === "desc" ? -diff : diff;
    }
  }
  return 0;
}

function seed(rankCheckId: string, overrides: Partial<IntentRow> = {}) {
  intents.set(rankCheckId, {
    attempts: 0,
    completedAt: null,
    createdAt: new Date("2026-11-03T12:00:00.000Z"),
    leaseUntil: null,
    rankCheckId,
    state: "pending",
    ...overrides,
  });
}

beforeEach(() => {
  intents.clear();
  notifyOps.mockClear();
});

describe("alert evaluation intents", () => {
  it("retries a failed evaluation only after backoff", async () => {
    seed("check_1");
    let calls = 0;
    const evaluate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("stopped before the later rule");
      return { alerts: [{ id: "alert_later" }], trigger: "manual" };
    });

    await processPendingAlertEvaluationIntents({ evaluate });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(intents.get("check_1")).toMatchObject({ attempts: 1, state: "pending" });
    const backedOff = intents.get("check_1")?.leaseUntil?.getTime() ?? 0;
    expect(backedOff).toBeGreaterThanOrEqual(Date.now() + BACKOFF_BASE_MS - 1_000);

    await processPendingAlertEvaluationIntents({ evaluate });
    expect(evaluate).toHaveBeenCalledTimes(1);

    const row = intents.get("check_1");
    if (row) row.leaseUntil = new Date(Date.now() - 1_000);
    const result = await processPendingAlertEvaluationIntents({
      evaluate,
      now: new Date(Date.now() + 1_000),
    });
    expect(result).toEqual({ failed: 0, immediateAlertIds: ["alert_later"], processed: 1 });
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(intents.get("check_1")).toMatchObject({ leaseUntil: null, state: "done" });
  });

  it("backs off one failed attempt instead of clearing the lease", async () => {
    seed("check_1");
    const evaluate = vi.fn(async () => {
      throw new Error("evaluation unavailable");
    });
    const before = Date.now();
    await expect(processPendingAlertEvaluationIntents({ evaluate })).resolves.toEqual({
      failed: 1,
      immediateAlertIds: [],
      processed: 0,
    });
    expect(evaluate).toHaveBeenCalledTimes(1);
    const row = intents.get("check_1");
    expect(row).toMatchObject({ attempts: 1, state: "pending" });
    expect(row?.leaseUntil).toBeInstanceOf(Date);
    expect(row?.leaseUntil?.getTime()).toBeGreaterThanOrEqual(before + BACKOFF_BASE_MS);
    expect(row?.leaseUntil?.getTime()).toBeLessThanOrEqual(Date.now() + BACKOFF_BASE_MS);
  });

  it("fails the intent and notifies operators once the attempt cap is reached", async () => {
    seed("check_1", {
      attempts: MAX_ATTEMPTS - 1,
      leaseUntil: new Date(Date.now() - 1_000),
    });
    const evaluate = vi.fn(async () => {
      throw new Error("poison payload");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await processPendingAlertEvaluationIntents({ evaluate });
    expect(intents.get("check_1")).toMatchObject({
      attempts: MAX_ATTEMPTS,
      state: "failed",
    });
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "alert-evaluation-intent-failed:check_1",
        kind: "alert_evaluation_intent_failed",
        severity: "error",
      }),
    );
    expect(error).toHaveBeenCalledWith(
      "[alerts] evaluation intent failed",
      expect.objectContaining({
        error: expect.stringContaining("poison payload"),
        rankCheckId: "check_1",
      }),
    );
    await processPendingAlertEvaluationIntents({ evaluate });
    expect(evaluate).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("does not let backing-off intents starve a newer one", async () => {
    for (let index = 0; index < 20; index += 1) {
      seed(`poison_${index}`, {
        createdAt: new Date(Date.UTC(2026, 10, 3, 12, 0, index)),
      });
    }
    const evaluate = vi.fn(async (rankCheckId: string) => {
      if (rankCheckId.startsWith("poison")) throw new Error("poison");
      return { alerts: [], trigger: "manual" as const };
    });
    await processPendingAlertEvaluationIntents({ evaluate, limit: 20 });
    seed("fresh", { createdAt: new Date(Date.UTC(2026, 10, 3, 13, 0, 0)) });
    evaluate.mockClear();
    await processPendingAlertEvaluationIntents({ evaluate, limit: 20 });
    expect(evaluate.mock.calls.map((call) => call[0])).toEqual(["fresh"]);
  });

  it("orders a never-leased intent ahead of due retries", async () => {
    const due = new Date(Date.now() - 1_000);
    for (let index = 0; index < 20; index += 1) {
      seed(`retry_${index}`, {
        attempts: 1,
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, index)),
        leaseUntil: due,
      });
    }
    seed("fresh", { createdAt: new Date(Date.UTC(2026, 10, 3, 0, 0, 0)), leaseUntil: null });
    const evaluate = vi.fn(async (_rankCheckId: string) => ({
      alerts: [],
      trigger: "scheduled" as const,
    }));
    await processPendingAlertEvaluationIntents({ evaluate, limit: 20 });
    const ids = evaluate.mock.calls.map((call) => call[0]);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("fresh");
    expect(ids).not.toContain("retry_19");
  });

  it("does not overwrite a lease held by a later claim", async () => {
    seed("check_1");
    const stolen = new Date("2099-01-01T00:00:00.000Z");
    const evaluate = vi.fn(async () => {
      const row = intents.get("check_1");
      if (row) row.leaseUntil = stolen;
      throw new Error("slow failure");
    });
    await processPendingAlertEvaluationIntents({ evaluate });
    expect(intents.get("check_1")).toMatchObject({
      attempts: 0,
      leaseUntil: stolen,
      state: "pending",
    });
  });

  it("does not complete an intent after its lease was taken over", async () => {
    seed("check_1");
    const stolen = new Date("2099-01-01T00:00:00.000Z");
    const evaluate = vi.fn(async () => {
      const row = intents.get("check_1");
      if (row) row.leaseUntil = stolen;
      return { alerts: [{ id: "alert_1" }], trigger: "manual" as const };
    });
    await processPendingAlertEvaluationIntents({ evaluate });
    expect(intents.get("check_1")).toMatchObject({
      leaseUntil: stolen,
      state: "pending",
    });
  });

  it("does not evaluate a done intent again", async () => {
    seed("check_1", { completedAt: new Date(), state: "done" });
    const evaluate = vi.fn();
    await expect(processPendingAlertEvaluationIntents({ evaluate })).resolves.toEqual({
      failed: 0,
      immediateAlertIds: [],
      processed: 0,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("does not claim an intent with an active lease", async () => {
    seed("check_1", { leaseUntil: new Date(Date.now() + 60_000) });
    const evaluate = vi.fn();
    await processPendingAlertEvaluationIntents({ evaluate });
    expect(evaluate).not.toHaveBeenCalled();
    expect(intents.get("check_1")?.state).toBe("pending");
  });

  it("claims an intent whose lease has expired", async () => {
    seed("check_1", { leaseUntil: new Date(Date.now() - 1_000) });
    const evaluate = vi.fn(async () => ({ alerts: [{ id: "alert_1" }], trigger: "scheduled" }));
    const result = await processPendingAlertEvaluationIntents({ evaluate });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(result.immediateAlertIds).toEqual([]);
    expect(intents.get("check_1")?.state).toBe("done");
  });
});
