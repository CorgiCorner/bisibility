import { expect, test, vi } from "vitest";
import { readObservedResponse } from "./usage";

test("a billable request with no observer never reaches HTTP", async () => {
  const request = vi.fn(async () => new Response("{}"));
  await expect(
    readObservedResponse({
      request,
      requireMeasuredUsage: true,
      measure: () => ({ costCents: 1, quantity: 1, cached: false, failed: false }),
    }),
  ).rejects.toMatchObject({ phase: "admission" });
  expect(request).not.toHaveBeenCalled();
});
