import { afterEach, beforeEach, expect, it, vi } from "vitest";

const gates = vi.hoisted(() => ({ consume: vi.fn(), live: vi.fn(), assert: vi.fn() }));
vi.mock("@/lib/providers/rate-limit", async () => ({
  ...(await vi.importActual<typeof import("@/lib/providers/rate-limit")>(
    "@/lib/providers/rate-limit",
  )),
  consumeProviderLimit: gates.consume,
}));
vi.mock("@/lib/providers/live-capacity", () => ({
  reserveLiveResponseCapacity: gates.live,
  assertLiveResponseCapacity: gates.assert,
}));

import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { freshModelCapabilities } from "./capabilities";
import { TrackingDeadlineError, TrackingDispatchDeniedError } from "./dispatch-error";
import { trackingTransport } from "./transport";

const credentials = { login: "fixture", password: "fixture" };
beforeEach(() => {
  vi.clearAllMocks();
  gates.consume.mockResolvedValue({
    success: true,
    accountKey: "opaque",
    resetAt: Date.now() + 60_000,
  });
  gates.live.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
it("applies the existing account request limiter to free task GET and fresh model metadata", async () => {
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [{ model_name: "gpt-4.1-mini", task_post_supported: true }],
            },
          ],
        }),
      ),
  );
  await trackingTransport({
    endpoint: "ai_optimization/chat_gpt/llm_responses/task_get/fixture-task",
    credentials,
    projectId: "project",
    deadline: new Date(Date.now() + 10_000).toISOString(),
    request,
  });
  await freshModelCapabilities(samplePlan(), credentials, request);
  expect(gates.consume).toHaveBeenCalledTimes(2);
  expect(gates.consume).toHaveBeenNthCalledWith(1, "dataforseo", credentials, {
    projectId: "project",
  });
  expect(gates.consume).toHaveBeenNthCalledWith(2, "dataforseo", credentials, {
    projectId: "project",
  });
  expect(request).toHaveBeenCalledTimes(2);
});
it("refuses paid POST when its deadline crosses during final quota admission, before fetch", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
  const deadline = new Date(Date.now() + 1000).toISOString();
  gates.consume.mockImplementationOnce(async () => {
    vi.advanceTimersByTime(1001);
    return { success: true };
  });
  const request = vi.fn();
  await expect(
    trackingTransport({
      endpoint: "ai_optimization/chat_gpt/llm_responses/task_post",
      credentials,
      deadline,
      payload: { user_prompt: "Exact fixture" },
      request,
    }),
  ).rejects.toBeInstanceOf(TrackingDeadlineError);
  expect(request).not.toHaveBeenCalled();
});
it.each(["GET", "metadata"])("quota denial stops %s I/O", async (kind) => {
  gates.consume.mockResolvedValueOnce({
    success: false,
    accountKey: "opaque",
    resetAt: Date.now() + 60_000,
  });
  const request = vi.fn();
  const call =
    kind === "metadata"
      ? freshModelCapabilities(samplePlan(), credentials, request)
      : trackingTransport({
          endpoint: "test/task_get/fixture",
          credentials,
          deadline: samplePlan().deadline,
          request,
        });
  await expect(call).rejects.toBeInstanceOf(TrackingDispatchDeniedError);
  expect(request).not.toHaveBeenCalled();
});
it("live Responses capacity is reserved before dispatch and refusal is proved zero I/O", async () => {
  gates.live.mockRejectedValueOnce(new Error("Shared capacity exhausted."));
  const request = vi.fn();
  await expect(
    trackingTransport({
      endpoint: "ai_optimization/chat_gpt/llm_responses/live",
      credentials,
      deadline: samplePlan().deadline,
      payload: { user_prompt: "Exact fixture" },
      request,
    }),
  ).rejects.toBeInstanceOf(TrackingDispatchDeniedError);
  expect(gates.live).toHaveBeenCalledWith(credentials, undefined);
  expect(request).not.toHaveBeenCalled();
});
it("an expired live reservation is a typed zero-I/O refusal at the final fetch boundary", async () => {
  gates.live.mockResolvedValueOnce({ dispatchExpiresAt: Date.now() + 5000 });
  gates.assert.mockImplementationOnce(() => {
    throw new Error("Expired capacity");
  });
  const request = vi.fn();
  await expect(
    trackingTransport({
      endpoint: "ai_optimization/chat_gpt/llm_responses/live",
      credentials,
      deadline: samplePlan().deadline,
      payload: { user_prompt: "Exact fixture" },
      request,
    }),
  ).rejects.toBeInstanceOf(TrackingDispatchDeniedError);
  expect(request).not.toHaveBeenCalled();
});
