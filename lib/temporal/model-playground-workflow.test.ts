import { beforeEach, expect, test, vi } from "vitest";

const activities = vi.hoisted(() => ({
  execute: vi.fn(),
  stop: vi.fn(),
  sleep: vi.fn(),
  proxy: vi.fn(),
}));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: (options: unknown) => {
    activities.proxy(options);
    return {
      executeModelPlaygroundActivity: activities.execute,
      stopModelPlaygroundRecoveryActivity: activities.stop,
    };
  },
  sleep: activities.sleep,
  continueAsNew: vi.fn(),
}));

import { modelPlaygroundWorkflow } from "./model-playground-workflow";

const input = { projectId: "project", runId: "00000000-0000-4000-8000-000000000001" };
beforeEach(() => {
  activities.execute.mockReset();
  activities.stop.mockReset();
  activities.sleep.mockReset();
});
test("SQL give-up ends polling with backoff supplied by durable attempts", async () => {
  activities.execute
    .mockResolvedValueOnce({ terminal: false, retryAfterMs: 30_000 })
    .mockResolvedValue({ terminal: false, stopped: true });
  await modelPlaygroundWorkflow(input);
  expect(activities.execute).toHaveBeenCalledTimes(2);
  expect(activities.sleep).toHaveBeenCalledExactlyOnceWith(30_000);
  expect(activities.stop).not.toHaveBeenCalled();
});
test("transient failures never durably stop admitted work", async () => {
  activities.execute
    .mockRejectedValueOnce(new Error("Database unavailable"))
    .mockResolvedValue({ terminal: true });
  await modelPlaygroundWorkflow(input);
  expect(activities.stop).not.toHaveBeenCalled();
  expect(activities.execute).toHaveBeenCalledTimes(2);
});
test.each([{ terminal: true }, { terminal: false, stopped: true }])(
  "terminal or durable stop ends polling: %j",
  async (progress) => {
    activities.execute.mockResolvedValue(progress);
    await modelPlaygroundWorkflow(input);
    expect(activities.execute).toHaveBeenCalledTimes(1);
    expect(activities.stop).not.toHaveBeenCalled();
    expect(activities.sleep).not.toHaveBeenCalled();
  },
);
test("activity failures retry with backoff until SQL attempts decide give-up", () => {
  expect(activities.proxy).toHaveBeenCalledWith(
    expect.objectContaining({
      retry: expect.objectContaining({
        initialInterval: "5 seconds",
        maximumInterval: "30 seconds",
      }),
    }),
  );
});

test("transient retry policy has no maximumAttempts stop trigger", () => {
  expect(activities.proxy.mock.calls[0][0].retry.maximumAttempts).toBeUndefined();
});

test("a stopped result ends polling without a separate stop activity", async () => {
  activities.execute.mockResolvedValue({ terminal: false, stopped: true });
  await modelPlaygroundWorkflow(input);
  expect(activities.execute).toHaveBeenCalledTimes(1);
  expect(activities.stop).not.toHaveBeenCalled();
  expect(activities.sleep).not.toHaveBeenCalled();
});
