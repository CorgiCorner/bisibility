import { afterEach, expect, test, vi } from "vitest";

const probe = vi.hoisted(() => vi.fn(async () => [{ pending: true }]));

const recoverStoppedModelPlaygroundRuns = vi.hoisted(() => vi.fn(async () => undefined));
const recoverModelPlaygroundTerminalHooks = vi.hoisted(() => vi.fn(async () => undefined));
const recoverModelPlaygroundReports = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{
      ok: true;
      attempted: number;
      saved: number;
      failed: number;
      next: { createdAt: string; id: string } | null;
    }> => ({ ok: true, attempted: 0, saved: 0, failed: 0, next: null }),
  ),
);
vi.mock("./stopped-recovery", () => ({ recoverStoppedModelPlaygroundRuns }));
vi.mock("./terminal", () => ({ recoverModelPlaygroundTerminalHooks }));
vi.mock("./report-recovery", () => ({ recoverModelPlaygroundReports }));
vi.mock("../db/prisma", () => ({
  prisma: {
    $transaction: (work: (tx: { $queryRaw: typeof probe }) => unknown) =>
      work({ $queryRaw: probe }),
  },
}));

import {
  startModelPlaygroundRecoverySweep,
  sweepModelPlaygroundRecovery,
} from "./recovery-schedule";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("local review with maintenance disabled never starts recovery", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
  vi.useFakeTimers();
  const sweep = startModelPlaygroundRecoverySweep();
  await vi.advanceTimersByTimeAsync(60_000);
  sweep.close();
  expect(probe).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("production recovery remains enabled when maintenance is disabled", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
  vi.useFakeTimers();
  const sweep = startModelPlaygroundRecoverySweep();
  try {
    await vi.advanceTimersByTimeAsync(30_000);
    expect(probe).toHaveBeenCalled();
  } finally {
    sweep.close();
  }
});

test("a started sweep recovers on each tick", async () => {
  vi.useFakeTimers();
  const sweep = startModelPlaygroundRecoverySweep();
  try {
    await vi.advanceTimersByTimeAsync(30_000);
    expect(recoverStoppedModelPlaygroundRuns).toHaveBeenCalled();
    const calls = recoverStoppedModelPlaygroundRuns.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(recoverStoppedModelPlaygroundRuns.mock.calls.length).toBeGreaterThan(calls);
    expect(recoverModelPlaygroundTerminalHooks).toHaveBeenCalled();
    const hooks = recoverModelPlaygroundTerminalHooks.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(recoverModelPlaygroundTerminalHooks.mock.calls.length).toBeGreaterThan(hooks);
  } finally {
    sweep.close();
  }
});

test("report repair follows next until null", async () => {
  const cursor = {
    createdAt: "2026-11-14T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
  };
  recoverModelPlaygroundReports
    .mockResolvedValueOnce({ ok: true, attempted: 50, saved: 50, failed: 0, next: cursor })
    .mockResolvedValueOnce({ ok: true, attempted: 1, saved: 1, failed: 0, next: null });
  await sweepModelPlaygroundRecovery();
  expect(recoverModelPlaygroundReports).toHaveBeenNthCalledWith(2, expect.anything(), {
    after: cursor,
  });
});

test("one sweep step failing still runs the other and logs the error name", async () => {
  const failure = new Error("stopped branch unavailable");
  failure.name = "SweepStopError";
  recoverStoppedModelPlaygroundRuns.mockRejectedValueOnce(failure);
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await sweepModelPlaygroundRecovery();
    expect(recoverModelPlaygroundTerminalHooks).toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("[model-playground] recovery sweep step failed", {
      name: "SweepStopError",
    });
  } finally {
    logged.mockRestore();
  }
});

test("an empty probe skips every recovery step", async () => {
  probe.mockResolvedValueOnce([{ pending: false }]);
  await sweepModelPlaygroundRecovery();
  expect(probe).toHaveBeenCalledTimes(1);
  expect(recoverStoppedModelPlaygroundRuns).not.toHaveBeenCalled();
  expect(recoverModelPlaygroundTerminalHooks).not.toHaveBeenCalled();
  expect(recoverModelPlaygroundReports).not.toHaveBeenCalled();
});

test("a failed probe still runs all recovery steps", async () => {
  const failure = new Error("probe unavailable");
  failure.name = "ProbeError";
  probe.mockRejectedValueOnce(failure);
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await sweepModelPlaygroundRecovery();
    expect(recoverStoppedModelPlaygroundRuns).toHaveBeenCalledTimes(1);
    expect(recoverModelPlaygroundTerminalHooks).toHaveBeenCalledTimes(1);
    expect(recoverModelPlaygroundReports).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("[model-playground] recovery sweep step failed", {
      name: "ProbeError",
    });
  } finally {
    logged.mockRestore();
  }
});
