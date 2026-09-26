import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { budgetExhaustedResponse } from "./budget-exhausted";

const now = new Date("2026-09-19T10:00:00Z");
const resetSeconds = Math.ceil(
  (new Date("2026-10-01T00:00:00Z").getTime() - now.getTime()) / 1_000,
);

const ctx = { headers: new Headers({ "RateLimit-Remaining": "99" }), instance: "urn:test" };

describe("budgetExhaustedResponse", () => {
  it("names the surface, the reset time, and the budget period", async () => {
    const response = budgetExhaustedResponse(ctx, { now, surface: "programmatic" });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.details).toEqual({
      resets_at: "2026-10-01T00:00:00.000Z",
      surface: "programmatic",
    });
    expect(body.errors).toBeUndefined();
    expect(body.detail).toBe("API, MCP and SDK budget reached for September 2026.");
    expect(response.headers.get("Retry-After")).toBe(String(resetSeconds));
    expect(response.headers.get("RateLimit-Reset")).toBe(String(resetSeconds));
    expect(response.headers.get("ratelimit-remaining")).toBe("99");
  });

  it("names the provider when the caller knows it", async () => {
    const response = budgetExhaustedResponse(ctx, {
      connection: "conn_a00000000000000000000000",
      now,
      provider: "dataforseo",
      surface: "programmatic",
    });

    const body = await response.json();
    expect(body.detail).toBe("API, MCP and SDK budget for dataforseo reached for September 2026.");
    expect(body.details).toEqual({
      connection: "conn_a00000000000000000000000",
      provider: "dataforseo",
      resets_at: "2026-10-01T00:00:00.000Z",
      surface: "programmatic",
    });
  });

  it("uses the app wording for the app surface", async () => {
    const response = budgetExhaustedResponse(ctx, { now, surface: "app" });

    await expect(response.json()).resolves.toMatchObject({
      detail: "App and schedules budget reached for September 2026.",
      details: { surface: "app" },
    });
  });

  it("adds scope only when provided", async () => {
    const response = budgetExhaustedResponse(ctx, {
      now,
      scope: "wallet",
      surface: "programmatic",
    });
    await expect(response.json()).resolves.toMatchObject({
      details: { scope: "wallet", surface: "programmatic" },
    });
  });

  it("keeps a custom detail and never reports a reset in the past", async () => {
    const boundary = new Date("2026-10-31T23:59:59.999Z");
    const response = budgetExhaustedResponse(ctx, {
      detail: "Custom cap reached.",
      now: boundary,
      surface: "programmatic",
    });

    const body = await response.json();
    expect(body.detail).toBe("Custom cap reached.");
    expect(body.details.resets_at).toBe("2026-11-01T00:00:00.000Z");
    expect(response.headers.get("Retry-After")).toBe("1");
  });
});
