import { expect, test } from "vitest";
import { budgetExhaustedResponse } from "./budget-exhausted";

test("uncertainty gates expose no fabricated monthly retry", async () => {
  const input = { surface: "app" as const, resetAt: null };
  const response = budgetExhaustedResponse({ headers: new Headers(), instance: "/fixture" }, input);
  expect(response.status).toBe(429);
  expect(response.headers.has("Retry-After")).toBe(false);
  expect(response.headers.has("RateLimit-Reset")).toBe(false);
  expect(await response.json()).not.toHaveProperty("resets_at");
});
