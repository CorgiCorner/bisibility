import { afterEach, expect, it, vi } from "vitest";
import { requestApi } from "./set-schedule-request";

const mocks = vi.hoisted(() => ({ capacity: vi.fn() }));
vi.mock("@/lib/capacity/notice-store", () => ({ publishCapacityProblem: mocks.capacity }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("publishes an internal route capacity refusal", async () => {
  const problem = { code: "plan_limit_reached", details: { limit: 100, used: 100, requested: 1 } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(problem), { status: 403 })),
  );
  await expect(
    requestApi("/api/check-schedules/sch_story/keywords", { method: "POST" }),
  ).rejects.toThrow();
  expect(mocks.capacity).toHaveBeenCalledWith(problem);
});
it("preserves the attached review preview on a stale route response", async () => {
  const preview = { requires_review: true, cost_after_cents: 700 };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ errors: { code: "schedule_review_stale", preview } }), {
          status: 409,
        }),
    ),
  );
  await expect(
    requestApi("/api/check-schedules/sch_story/keywords", { method: "POST" }),
  ).rejects.toMatchObject({ code: "schedule_review_stale", preview });
  expect(mocks.capacity).not.toHaveBeenCalled();
});
