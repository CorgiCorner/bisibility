import { describe, expect, it, vi } from "vitest";

const achievementSweeps = vi.hoisted(() => ({
  facts: vi.fn(async () => ({ processed: 0 })),
  mail: vi.fn(async () => ({ sent: 0 })),
}));
const enqueue = vi.hoisted(() => vi.fn(async (_alertIds: string[]) => undefined));
vi.mock("../achievements/process", () => ({ sweepAchievementFacts: achievementSweeps.facts }));
vi.mock("../achievements/mail", () => ({ sweepAchievementMail: achievementSweeps.mail }));
vi.mock("./alert-delivery-client", () => ({ enqueueAlertDeliveries: enqueue }));

import { sweepWorkerIntents } from "./worker-intent-processor";

describe("worker intent processor", () => {
  it("claims intent kinds in the shared priority order", async () => {
    const rankRuns = vi.fn(async () => ({ claimed: 0, launched: 0, scanned: 0 }));
    const localRecurring = vi.fn(async () => ({
      enabled: false,
      queued: 0,
      blocked: 0,
      skipped: 0,
      retained: 0,
    }));
    const localMonitors = vi.fn(async () => ({ started: 0 }));
    const comparisons = vi.fn(async () => ({ started: 0 }));
    const tracking = vi.fn(async () => ({ started: 0 }));
    const search = vi.fn(async () => ({
      claimed: 0,
      failed: 0,
      scanned: 0,
      skipped: 0,
      started: 0,
    }));
    const traffic = vi.fn(async () => ({ status: "idle" as const }));
    const welcome = vi.fn(async () => ({ dispatched: 0, expired: 0 }));
    const alertEvaluations = vi.fn(async () => ({
      failed: 0,
      immediateAlertIds: [] as string[],
      processed: 0,
    }));

    await expect(
      sweepWorkerIntents({
        processAlertEvaluations: alertEvaluations,
        dispatchRankRuns: rankRuns,
        dispatchLocalMonitors: localMonitors,
        produceLocalMonitors: localRecurring,
        dispatchTracking: tracking,
        dispatchComparisons: comparisons,
        dispatchTraffic: traffic,
        reconcileSearchInsights: search,
        sweepWelcome: welcome,
      }),
    ).resolves.toEqual({
      rankRuns: { claimed: 0, launched: 0, scanned: 0 },
      alertEvaluations: { failed: 0, immediateAlertIds: [], processed: 0 },
      localMonitors: { started: 0 },
      localRecurring: { enabled: false, queued: 0, blocked: 0, skipped: 0, retained: 0 },
      comparisons: { started: 0 },
      tracking: { started: 0 },
      search: { claimed: 0, failed: 0, scanned: 0, skipped: 0, started: 0 },
      traffic: { status: "idle" },
      welcome: { dispatched: 0, expired: 0 },
    });

    expect(rankRuns.mock.invocationCallOrder[0]).toBeLessThan(
      alertEvaluations.mock.invocationCallOrder[0],
    );
    expect(alertEvaluations.mock.invocationCallOrder[0]).toBeLessThan(
      localRecurring.mock.invocationCallOrder[0],
    );
    expect(rankRuns.mock.invocationCallOrder[0]).toBeLessThan(
      localRecurring.mock.invocationCallOrder[0],
    );
    expect(localRecurring.mock.invocationCallOrder[0]).toBeLessThan(
      localMonitors.mock.invocationCallOrder[0],
    );
    expect(localMonitors.mock.invocationCallOrder[0]).toBeLessThan(
      tracking.mock.invocationCallOrder[0],
    );
    expect(rankRuns.mock.invocationCallOrder[0]).toBeLessThan(tracking.mock.invocationCallOrder[0]);
    expect(tracking.mock.invocationCallOrder[0]).toBeLessThan(search.mock.invocationCallOrder[0]);
    expect(search.mock.invocationCallOrder[0]).toBeLessThan(traffic.mock.invocationCallOrder[0]);
    expect(traffic.mock.invocationCallOrder[0]).toBeLessThan(welcome.mock.invocationCallOrder[0]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueues only the immediate alerts returned by a recovered evaluation", async () => {
    enqueue.mockClear();
    await sweepWorkerIntents({
      processAlertEvaluations: async () => ({
        failed: 0,
        immediateAlertIds: ["alert_1"],
        processed: 1,
      }),
      dispatchRankRuns: async () => ({ claimed: 0, launched: 0, scanned: 0 }),
      produceLocalMonitors: async () => ({
        enabled: false,
        queued: 0,
        blocked: 0,
        skipped: 0,
        retained: 0,
      }),
      dispatchLocalMonitors: async () => ({ started: 0 }),
      dispatchComparisons: async () => ({ started: 0 }),
      dispatchTracking: async () => ({ started: 0 }),
      reconcileSearchInsights: async () => ({
        claimed: 0,
        failed: 0,
        scanned: 0,
        skipped: 0,
        started: 0,
      }),
      dispatchTraffic: async () => ({ status: "idle" as const }),
      sweepWelcome: async () => ({ dispatched: 0, expired: 0 }),
    });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(["alert_1"]);
  });

  it("logs the evaluation sweep error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await sweepWorkerIntents({
        processAlertEvaluations: async () => {
          throw new Error("sweep broke");
        },
        dispatchRankRuns: async () => ({ claimed: 0, launched: 0, scanned: 0 }),
        produceLocalMonitors: async () => ({
          enabled: false,
          queued: 0,
          blocked: 0,
          skipped: 0,
          retained: 0,
        }),
        dispatchLocalMonitors: async () => ({ started: 0 }),
        dispatchComparisons: async () => ({ started: 0 }),
        dispatchTracking: async () => ({ started: 0 }),
        reconcileSearchInsights: async () => ({
          claimed: 0,
          failed: 0,
          scanned: 0,
          skipped: 0,
          started: 0,
        }),
        dispatchTraffic: async () => ({ status: "idle" as const }),
        sweepWelcome: async () => ({ dispatched: 0, expired: 0 }),
      });
      expect(log).toHaveBeenCalledWith("[alerts] evaluation intent sweep failed", {
        error: "sweep broke",
      });
    } finally {
      log.mockRestore();
    }
  });
});

it("keeps welcome work running when either achievements sweep fails", async () => {
  const empty = vi.fn(async () => ({ started: 0 }));
  const welcome = vi.fn(async () => ({ dispatched: 1, expired: 0 }));
  const alertEvaluations = vi.fn(async () => ({
    failed: 0,
    immediateAlertIds: [] as string[],
    processed: 0,
  }));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  achievementSweeps.facts.mockRejectedValueOnce(new Error("expired transaction"));
  achievementSweeps.mail.mockRejectedValueOnce(new Error("missing table"));
  try {
    const result = await sweepWorkerIntents({
      processAlertEvaluations: alertEvaluations,
      dispatchRankRuns: async () => ({ claimed: 0, launched: 0, scanned: 0 }),
      produceLocalMonitors: async () => ({
        enabled: false,
        queued: 0,
        blocked: 0,
        skipped: 0,
        retained: 0,
      }),
      dispatchLocalMonitors: empty,
      dispatchComparisons: empty,
      dispatchTracking: empty,
      reconcileSearchInsights: async () => ({
        claimed: 0,
        failed: 0,
        scanned: 0,
        skipped: 0,
        started: 0,
      }),
      dispatchTraffic: async () => ({ status: "idle" as const }),
      sweepWelcome: welcome,
    });
    expect(welcome).toHaveBeenCalledOnce();
    expect(result.welcome.dispatched).toBe(1);
  } finally {
    log.mockRestore();
  }
});
