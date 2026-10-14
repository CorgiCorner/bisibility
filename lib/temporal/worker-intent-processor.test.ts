import { describe, expect, it, vi } from "vitest";
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

    await expect(
      sweepWorkerIntents({
        dispatchRankRuns: rankRuns,
        dispatchLocalMonitors: localMonitors,
        produceLocalMonitors: localRecurring,
        dispatchTracking: tracking,
        dispatchTraffic: traffic,
        reconcileSearchInsights: search,
        sweepWelcome: welcome,
      }),
    ).resolves.toEqual({
      rankRuns: { claimed: 0, launched: 0, scanned: 0 },
      localMonitors: { started: 0 },
      localRecurring: { enabled: false, queued: 0, blocked: 0, skipped: 0, retained: 0 },
      tracking: { started: 0 },
      search: { claimed: 0, failed: 0, scanned: 0, skipped: 0, started: 0 },
      traffic: { status: "idle" },
      welcome: { dispatched: 0, expired: 0 },
    });

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
  });
});
