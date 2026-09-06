import { describe, expect, it, vi } from "vitest";
import { sweepWorkerIntents } from "./worker-intent-processor";

describe("worker intent processor", () => {
  it("claims intent kinds in the shared priority order", async () => {
    const rankRuns = vi.fn(async () => ({ claimed: 0, launched: 0, scanned: 0 }));
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
        dispatchTraffic: traffic,
        reconcileSearchInsights: search,
        sweepWelcome: welcome,
      }),
    ).resolves.toEqual({
      rankRuns: { claimed: 0, launched: 0, scanned: 0 },
      search: { claimed: 0, failed: 0, scanned: 0, skipped: 0, started: 0 },
      traffic: { status: "idle" },
      welcome: { dispatched: 0, expired: 0 },
    });

    expect(rankRuns.mock.invocationCallOrder[0]).toBeLessThan(search.mock.invocationCallOrder[0]);
    expect(search.mock.invocationCallOrder[0]).toBeLessThan(traffic.mock.invocationCallOrder[0]);
    expect(traffic.mock.invocationCallOrder[0]).toBeLessThan(welcome.mock.invocationCallOrder[0]);
  });
});
