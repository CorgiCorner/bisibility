import { beforeEach, expect, it, vi } from "vitest";
import { createAlertDeliveryWorkers } from "./alert-delivery-workers";

const create = vi.hoisted(() => vi.fn());
vi.mock("@temporalio/worker", () => ({ Worker: { create } }));
vi.mock("./fenced-digest-activities", () => ({ deliverFencedAlertDigestWebhookActivity: vi.fn() }));
vi.mock("./worker-config", () => ({ maxConcurrentActivities: () => 4 }));
beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ run: vi.fn() });
});
it("keeps the fenced queue's activity registry separate from legacy polling", async () => {
  const activities = { legacy: vi.fn() };
  await createAlertDeliveryWorkers({
    activities,
    mainTaskQueue: "main",
    taskQueue: "deliveries",
    namespace: "fixture",
  });
  const calls = create.mock.calls.map(([options]) => options);
  expect(calls.map((options) => options.taskQueue)).toEqual([
    "main",
    "deliveries",
    "deliveries-fenced-v1",
  ]);
  expect(calls.slice(0, 2).every((options) => options.activities === activities)).toBe(true);
  expect(Object.keys(calls[2].activities)).toEqual(["deliverFencedAlertDigestWebhookActivity"]);
  expect(calls.every((options) => options.maxConcurrentActivityTaskExecutions === 4)).toBe(true);
});
it("keeps an already suffixed base distinct from the new consumer queue", async () => {
  const base = "deliveries-fenced-v1";
  await createAlertDeliveryWorkers({
    activities: {},
    mainTaskQueue: "main",
    taskQueue: base,
    namespace: "fixture",
  });
  expect(create.mock.calls[2][0].taskQueue).toBe(`${base}-fenced-v1`);
  expect(create.mock.calls[2][0].taskQueue).not.toBe(base);
});
