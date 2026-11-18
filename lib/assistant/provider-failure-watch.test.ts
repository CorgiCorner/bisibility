import { expect, test, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));

import {
  PROVIDER_FAILURE_ALERT_MIN,
  unusualProviderFailures,
  watchZeroCostProviderFailures,
} from "./provider-failure-watch";

test("only failures that are both numerous and a large share are unusual", () => {
  expect(
    unusualProviderFailures([
      { provider: "openai", failures: PROVIDER_FAILURE_ALERT_MIN, dispatched: 40 },
      { provider: "anthropic", failures: PROVIDER_FAILURE_ALERT_MIN - 1, dispatched: 9 },
      { provider: "openrouter", failures: 30, dispatched: 1000 },
    ]).map((row) => row.provider),
  ).toEqual(["openai"]);
});

test("an unusual provider alerts operations once per hour bucket", async () => {
  const notify = vi.fn(async () => {});
  const rows = [
    { provider: "openai", failures: 12n, dispatched: 20n },
    { provider: "anthropic", failures: 1n, dispatched: 50n },
  ];
  const transaction = async <T>(body: (tx: never) => Promise<T>) =>
    body({ $queryRaw: async () => rows } as never);
  const clock = { now: () => new Date("2026-11-14T18:30:00Z") };
  const result = await watchZeroCostProviderFailures({ clock, transaction, notify });
  expect(result.alerted).toEqual(["openai"]);
  expect(notify).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "assistant_provider_zero_cost_failures",
      dedupeKey: expect.stringMatching(/^assistant_provider_zero_cost_failures:openai:\d+$/),
    }),
  );
});
