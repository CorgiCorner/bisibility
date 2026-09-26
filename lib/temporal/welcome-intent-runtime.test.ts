import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  monitor: vi.fn(),
  enabled: vi.fn(),
  heartbeat: vi.fn(),
  snapshot: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../ops/heartbeat-temporal", () => ({ collectTemporalHeartbeat: vi.fn() }));
vi.mock("../ops/liveness", () => ({
  refreshWorkerLiveness: mocks.heartbeat,
  WORKER_LIVENESS_REFRESH_MS: 60_000,
}));
vi.mock("../ops/temporal-snapshot", () => ({ publishTemporalSnapshot: mocks.snapshot }));
vi.mock("../provider-usage/reconciliation-monitor", () => ({
  monitorProviderUsageReconciliation: mocks.monitor,
}));
vi.mock("./maintenance-schedule-bootstrap", () => ({
  isScheduledMaintenanceEnabled: mocks.enabled,
}));
vi.mock("./connection-options", () => ({ temporalWebUiUrl: () => null }));
vi.mock("./worker-extensions", () => ({ startWorkerExtensions: () => ({ close: mocks.close }) }));
vi.mock("./worker-intent-processor", () => ({
  startWorkerIntentProcessor: () => ({ close: mocks.close }),
}));

import { runWelcomeIntentRuntime } from "./welcome-intent-runtime";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.heartbeat.mockResolvedValue(undefined);
  mocks.snapshot.mockResolvedValue(undefined);
  mocks.monitor.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("worker accounting watchdog wiring", () => {
  it.each([true, false])(
    "checks reconciliation independently when maintenance enabled=%s",
    async (enabled) => {
      mocks.enabled.mockReturnValue(enabled);
      const startedAt = new Date();
      let finish = () => {};
      const done = {
        promise: new Promise<void>((resolve) => {
          finish = resolve;
        }),
        resolve: () => finish(),
      };
      const worker = { run: () => done.promise };
      const running = runWelcomeIntentRuntime({
        connectionOptions: {} as never,
        worker,
        deliveryWorker: worker,
      });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mocks.monitor).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (enabled) expect(mocks.monitor).toHaveBeenCalledWith(startedAt);
      done.resolve();
      await running;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mocks.monitor).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(mocks.close).toHaveBeenCalledTimes(2);
    },
  );
});
