import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Audit-only: original pinned persistence and sweep control flow, no real services.
type IntentRow = {
  attempts: number;
  completedAt: Date | null;
  createdAt: Date;
  leaseUntil: Date | null;
  predecessorRankCheckId: string | null;
  rankCheckId: string;
  state: string;
};

const intents = new Map<string, IntentRow>();
const checks = new Map<string, { id: string; trigger?: string | null }>();

const m = vi.hoisted(() => ({
  committed: false,
  trace: [] as string[],
  evaluate: vi.fn(),
  enqueue: vi.fn(),
  start: vi.fn(),
  transaction: vi.fn(),
  notify: vi.fn(),
  ops: vi.fn(),
  summary: vi.fn(),
  updateRunning: vi.fn(),
  db: {
    alertEvaluationIntent: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    rankCheck: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    triggeredAlert: { updateMany: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/generated/prisma/client", () => ({ Prisma: { JsonNull: null, DbNull: null } }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: m.ops }));
vi.mock("@/lib/db/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/db/public-id", () => ({
  makePublicId: () => "check_a00000000000000000000000",
  isPublicIdOfType: () => true,
}));
vi.mock("@/lib/notifications/transaction", () => ({ notificationTransaction: m.transaction }));
vi.mock("@/lib/notifications/check-summaries/triggers", () => ({ queueCheckSummary: m.summary }));
vi.mock("@/lib/alerts/evaluate", () => ({ evaluateKeywordAlerts: m.evaluate }));
vi.mock("@/lib/auth/audit", () => ({ requiredPublicAuditId: (value: string) => value }));
vi.mock("@/lib/checks/attempts", () => ({ deriveCheckAttemptSummary: () => ({}) }));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: m.notify,
  notifyRankCheckFailed: vi.fn(),
}));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: vi.fn(async () => undefined),
}));
vi.mock("@/lib/observation/persist", () => ({
  persistRankCheckObservation: vi.fn(async () => undefined),
}));
vi.mock("@/lib/provider-evidence/recovery/capture", () => ({
  captureRecoveryCandidate: vi.fn(async () => undefined),
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: vi.fn(async () => undefined) }));
vi.mock("@/lib/signals/rank-check", () => ({ signalsForRankCheck: () => [] }));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({
  enqueueAlertDeliveries: m.enqueue,
  startAlertDeliveryWorkflow: m.start,
}));
vi.mock("@/lib/rank-check/cost", () => ({ positiveCostCents: (n: number) => n }));
vi.mock("@/lib/rank-check/recovery-evidence", () => ({
  retainRankResult: vi.fn(async () => false),
  consumeRankResult: vi.fn(async () => undefined),
}));
vi.mock("@/lib/rank-check/runner-persistence-shared", () => ({
  updateRunningRankCheck: m.updateRunning,
  writeRankCheckAudit: vi.fn(async () => undefined),
}));
vi.mock("@/lib/rank-check/runs/items", () => ({
  applyRunItemTransition: vi.fn(async () => undefined),
}));
// These are unused branches of the original context module, not the sweep logic.
vi.mock("@/lib/schemas/project", () => ({ trackedProjectDomain: (s: string) => s }));
vi.mock("@/lib/alerts/daily-cap", () => ({
  recordSuppressed: vi.fn(),
  reserveDeliveryBudgetOnce: vi.fn(),
}));
vi.mock("@/lib/alerts/overflow-notice", () => ({ sendAlertOverflowNotice: vi.fn() }));
vi.mock("@/lib/alerts/push-content", () => ({ alertPushMessage: vi.fn() }));
vi.mock("@/lib/alerts/recipients", () => ({
  filterAlertEmailRecipients: vi.fn(),
  resolveAlertRuleRecipients: vi.fn(),
}));

import { processPendingAlertEvaluationIntents } from "@/lib/alerts/evaluation-intent";
import { persistRankCheck } from "@/lib/rank-check/runner-persistence";
import { sweepAlertDeliveriesActivity } from "@/lib/temporal/alert-delivery-context";

function fixture(trigger: "manual" | "scheduled" = "manual") {
  const at = new Date("2026-10-01T00:00:00Z");
  return {
    target: {
      keywordId: "kw_internal",
      keywordPublicId: "kw_a00000000000000000000000",
      projectId: "project_internal",
      hasSchedule: false,
      hasDefaults: false,
    },
    result: {
      comparisonAllowed: true,
      rankCheck: {
        keywordId: "kw_internal",
        trigger,
        checkedAt: at,
        provider: "mock",
        position: 30,
        previousPosition: 3,
        requestedDepth: 100,
        normalizationVersion: "v2",
        rankingUrl: "https://example.com/page",
        raw: {},
        observation: null,
        costCents: 0,
        billingUnits: 0,
      },
      scheduleUpdate: { lastCheckedAt: at },
    },
  };
}

function leaseOpen(row: IntentRow, now: Date) {
  return row.leaseUntil === null || row.leaseUntil.getTime() < now.getTime();
}

beforeEach(() => {
  vi.resetAllMocks();
  intents.clear();
  checks.clear();
  m.committed = false;
  m.trace.length = 0;
  m.db.alertEvaluationIntent.create.mockImplementation(async ({ data }) => {
    m.trace.push("evaluation-intent");
    const row: IntentRow = {
      attempts: 0,
      completedAt: null,
      createdAt: new Date(),
      leaseUntil: null,
      predecessorRankCheckId: data.predecessorRankCheckId ?? null,
      rankCheckId: data.rankCheckId,
      state: data.state ?? "pending",
    };
    intents.set(row.rankCheckId, row);
    return row;
  });
  m.db.alertEvaluationIntent.upsert.mockImplementation(async ({ where, create, update }) => {
    m.trace.push("evaluation-intent");
    const rankCheckId = where.rankCheckId as string;
    const existing = intents.get(rankCheckId);
    const next: IntentRow = existing
      ? { ...existing, ...update, rankCheckId }
      : {
          attempts: 0,
          completedAt: null,
          createdAt: new Date(),
          leaseUntil: null,
          predecessorRankCheckId: create.predecessorRankCheckId ?? null,
          rankCheckId,
          state: create.state ?? "pending",
        };
    intents.set(rankCheckId, next);
    return next;
  });
  m.db.alertEvaluationIntent.findUnique.mockImplementation(async ({ where }) => {
    return intents.get(where.rankCheckId) ?? null;
  });
  m.db.alertEvaluationIntent.findMany.mockImplementation(async ({ where }) => {
    const now = new Date();
    return [...intents.values()].filter((row) => row.state === where.state && leaseOpen(row, now));
  });
  m.db.alertEvaluationIntent.updateMany.mockImplementation(async ({ data, where }) => {
    const now = new Date();
    let count = 0;
    for (const row of intents.values()) {
      if (where.rankCheckId && row.rankCheckId !== where.rankCheckId) continue;
      if (where.state && row.state !== where.state) continue;
      if (where.OR && !leaseOpen(row, now)) continue;
      Object.assign(row, data);
      count += 1;
    }
    return { count };
  });
  m.db.rankCheck.findUnique.mockImplementation(async ({ where }) => checks.get(where.id) ?? null);
  m.db.rankCheck.findFirst.mockResolvedValue(null);
  m.db.rankCheck.create.mockImplementation(async ({ data }) => {
    m.trace.push("rank-check-write");
    const row = { ...data, id: "completed_check_1" };
    checks.set(row.id, row);
    return row;
  });
  m.transaction.mockImplementation(async (body: (tx: typeof m.db) => Promise<unknown>) => {
    const value = await body(m.db);
    m.committed = true;
    m.trace.push("transaction-commit");
    return value;
  });
  m.notify.mockResolvedValue(undefined);
  m.ops.mockResolvedValue(undefined);
  m.enqueue.mockResolvedValue(undefined);
  m.start.mockResolvedValue(undefined);
  m.db.triggeredAlert.updateMany.mockResolvedValue({ count: 0 });
  m.db.triggeredAlert.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it.each(["manual", "scheduled"] as const)(
  "%s evaluator failure after commit is recovered once by the pending intent",
  async (trigger) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    m.ops.mockResolvedValue(undefined);
    m.evaluate.mockImplementation(async () => {
      expect(m.committed).toBe(true);
      m.trace.push("evaluation-failed");
      throw new Error("injected evaluation database outage before any alert insert");
    });
    const { target, result } = fixture(trigger);
    const persisted = await persistRankCheck(target as never, result as never);
    expect(persisted).toMatchObject({ id: "completed_check_1", status: "completed", trigger });
    expect(m.trace).toEqual([
      "rank-check-write",
      "evaluation-intent",
      "transaction-commit",
      "evaluation-failed",
    ]);
    expect(intents.get("completed_check_1")?.state).toBe("pending");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[rank-check] alert evaluation failed",
      expect.objectContaining({ rankCheckId: "completed_check_1", projectId: "project_internal" }),
    );
    expect(m.ops).toHaveBeenCalledOnce();
    expect(m.ops).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "alert-evaluation-failure:project_internal",
        fields: expect.objectContaining({ "Rank check": "completed_check_1" }),
      }),
    );
    log.mockRestore();
    expect(m.summary).toHaveBeenCalledTimes(1); // Check summaries are not SEO-rule replay intents.
    expect(m.notify).toHaveBeenCalledTimes(1);
    expect(m.enqueue).not.toHaveBeenCalled();

    // Both sweeps execute the real implementation after the injected outage is gone.
    m.evaluate.mockResolvedValue([{ id: "alert_1" }]);
    await expect(sweepAlertDeliveriesActivity()).resolves.toEqual({ scanned: 0, started: 0 });
    await expect(sweepAlertDeliveriesActivity()).resolves.toEqual({ scanned: 0, started: 0 });
    expect(m.evaluate).toHaveBeenCalledTimes(1);
    const pending = intents.get("completed_check_1");
    if (pending) pending.leaseUntil = new Date(Date.now() - 1_000);
    const recovered = await processPendingAlertEvaluationIntents();
    expect(m.evaluate).toHaveBeenCalledTimes(2);
    expect(intents.get("completed_check_1")).toMatchObject({ leaseUntil: null, state: "done" });
    expect(recovered.immediateAlertIds).toEqual(trigger === "scheduled" ? [] : ["alert_1"]);
    expect(m.enqueue).not.toHaveBeenCalled();
    await processPendingAlertEvaluationIntents();
    expect(m.evaluate).toHaveBeenCalledTimes(2);
    expect(m.db.rankCheck.findMany).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
    expect(m.db.triggeredAlert.findMany).toHaveBeenCalledTimes(2);
    const query = m.db.triggeredAlert.findMany.mock.calls[0][0];
    expect(query.take).toBe(100);
    expect(query.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deliveryState: "pending" }),
        expect.objectContaining({ deliveryState: "delivering" }),
      ]),
    );
  },
);

it("CONTROL: successful immediate evaluation after commit enqueues the produced alert", async () => {
  m.evaluate.mockImplementation(async () => {
    expect(m.committed).toBe(true);
    m.trace.push("evaluation-succeeded");
    return [{ id: "alert_1" }];
  });
  const { target, result } = fixture();
  await expect(persistRankCheck(target as never, result as never)).resolves.toMatchObject({
    status: "completed",
  });
  expect(m.trace).toEqual([
    "rank-check-write",
    "evaluation-intent",
    "transaction-commit",
    "evaluation-succeeded",
  ]);
  expect(m.evaluate).toHaveBeenCalledTimes(1);
  expect(intents.get("completed_check_1")?.state).toBe("done");
  expect(m.enqueue).toHaveBeenCalledExactlyOnceWith(["alert_1"]);
  expect(m.ops).not.toHaveBeenCalled();
});

it("CONTROL: re-persisting a check does not restart a leased evaluation intent", async () => {
  const { target, result } = fixture();
  m.evaluate.mockRejectedValueOnce(new Error("evaluation unavailable"));
  const persisted = await persistRankCheck(target as never, result as never);
  expect(m.enqueue).not.toHaveBeenCalled();
  const afterFailure = intents.get("completed_check_1");
  expect(afterFailure).toMatchObject({ attempts: 1, state: "pending" });
  // Model a caller intentionally replaying persistence for the same existing check.
  // Shared update helper is a boundary mock; this does not claim real caller authorization/state eligibility.
  m.updateRunning.mockResolvedValue({ rankCheck: persisted, before: {} });
  await persistRankCheck(
    { ...target, existingRankCheckId: persisted.id } as never,
    result as never,
  );
  expect(m.evaluate).toHaveBeenCalledTimes(1);
  expect(intents.get("completed_check_1")).toMatchObject({
    attempts: afterFailure?.attempts,
    leaseUntil: afterFailure?.leaseUntil,
    state: "pending",
  });
  expect(m.db.rankCheck.create).toHaveBeenCalledTimes(1);
  expect(m.enqueue).not.toHaveBeenCalled();
});

// Scope: proves this persistence/sweep path, not absence of every conceivable replay service.
// A persistence replay keeps the attempt cap and lease; the recovery sweep evaluates again.

it("returns the committed check when the ops notification fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  m.evaluate.mockRejectedValue(new Error("evaluation unavailable"));
  m.ops.mockRejectedValue(new Error("notification unavailable"));
  const { target, result } = fixture();
  await expect(persistRankCheck(target as never, result as never)).resolves.toMatchObject({
    id: "completed_check_1",
    status: "completed",
  });
  expect(m.committed).toBe(true);
  expect(m.ops).toHaveBeenCalledOnce();
});

it("collapses repeated evaluation failures in one project onto one dedupe key", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  m.evaluate.mockRejectedValue(new Error("systematic evaluator failure"));
  m.db.rankCheck.create
    .mockImplementationOnce(async ({ data }) => ({ ...data, id: "failing_check_1" }))
    .mockImplementationOnce(async ({ data }) => ({ ...data, id: "failing_check_2" }));
  const { target, result } = fixture();
  await persistRankCheck(target as never, result as never);
  await persistRankCheck(target as never, result as never);
  expect(m.ops).toHaveBeenCalledTimes(2);
  const calls = m.ops.mock.calls.map(([input]) => input);
  expect(new Set(calls.map((input) => input.dedupeKey))).toEqual(
    new Set(["alert-evaluation-failure:project_internal"]),
  );
  expect(calls.map((input) => input.fields["Rank check"])).toEqual([
    "failing_check_1",
    "failing_check_2",
  ]);
});
