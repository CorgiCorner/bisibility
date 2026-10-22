import { expect, it } from "vitest";
import { aiStatusWhere } from "./ai-status-where";

it("keeps generic skipped and cost-limit skipped filters disjoint before pagination and counting", () => {
  const cost = aiStatusWhere("cost_limit_exceeded");
  expect(cost.state).toBe("skipped");
  const { state, ...reason } = cost;
  expect(aiStatusWhere("skipped")).toEqual({ state, NOT: reason });
  expect(aiStatusWhere("attention")).toEqual({
    NOT: { state: { in: ["planned", "running", "completed", "cancelled"] } },
  });
});
