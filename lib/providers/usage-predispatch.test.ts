import { expect, it, vi } from "vitest";
import { DeploymentAdmissionExhaustedError } from "./execution-extension-errors";
import { ProviderUsagePersistenceError, readObservedResponse } from "./usage";

const measurement = { cached: false, costCents: 2, quantity: 1, failed: false };

it("retains a typed budget denial and makes zero provider requests", async () => {
  const denied = new DeploymentAdmissionExhaustedError("budget", {
    scope: "connection",
    surface: "app",
  });
  const begin = vi.fn().mockRejectedValue(denied),
    request = vi.fn(),
    settle = vi.fn();
  await expect(
    readObservedResponse({ observer: { begin, settle }, request, measure: () => measurement }),
  ).rejects.toBe(denied);
  expect(begin).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();
  expect(settle).not.toHaveBeenCalled();
});

it("fixes one attempt key before admission and assigns a new key to another paid request", async () => {
  const order: string[] = [];
  const begin = vi.fn(async (input?: { attemptKey: string }) => {
    expect(input?.attemptKey).toMatch(/^[0-9a-f-]{36}$/);
    order.push("admit");
    return `attempt:${input?.attemptKey}`;
  });
  const settle = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn(async () => {
    order.push("dispatch");
    return Response.json({ value: 1 });
  });
  const input = { observer: { begin, settle }, request, measure: () => measurement };
  await readObservedResponse(input);
  await readObservedResponse(input);
  expect(order).toEqual(["admit", "dispatch", "admit", "dispatch"]);
  expect(begin.mock.calls[0]?.[0]?.attemptKey).not.toBe(begin.mock.calls[1]?.[0]?.attemptKey);
  expect(settle).toHaveBeenNthCalledWith(
    1,
    `attempt:${begin.mock.calls[0]?.[0]?.attemptKey}`,
    measurement,
  );
  expect(request).toHaveBeenCalledTimes(2);
});

it("never dispatches or retries admission when the first permit acknowledgement is unknown", async () => {
  const begin = vi
    .fn()
    .mockRejectedValue(new ProviderUsagePersistenceError({ attemptId: "retained-attempt" }));
  const request = vi.fn();
  await expect(
    readObservedResponse({
      observer: { begin, settle: vi.fn() },
      request,
      measure: () => measurement,
    }),
  ).rejects.toMatchObject({ phase: "admission", attemptId: "retained-attempt" });
  expect(begin).toHaveBeenCalledTimes(1);
  expect(begin).toHaveBeenCalledWith({ attemptKey: expect.any(String) });
  expect(request).not.toHaveBeenCalled();
});

it("keeps the dispatched attempt after an accounting failure without another provider request", async () => {
  const begin = vi.fn().mockResolvedValue("retained-attempt");
  const settle = vi.fn().mockRejectedValue(new Error("acknowledgement lost"));
  const request = vi.fn().mockResolvedValue(Response.json({ value: 1 }));
  await expect(
    readObservedResponse({ observer: { begin, settle }, request, measure: () => measurement }),
  ).rejects.toMatchObject({ phase: "settlement", attemptId: "retained-attempt" });
  expect(begin).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
  expect(settle).toHaveBeenCalledTimes(1);
});
