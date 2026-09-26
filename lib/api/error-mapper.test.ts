import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { LaunchRankCheckRunError } from "@/lib/rank-check/runs/launch-types";
import { errorFromUnknown } from "./error-mapper";

const headers = new Headers();
const url = new URL("https://example.com/api/v1/keywords/kw_a00000000000000000000000/checks");

describe("errorFromUnknown", () => {
  it("maps deployment balance admission to 402 without inherited reset timing or private data", async () => {
    const inherited = new Headers({
      "RateLimit-Remaining": "7",
      "Retry-After": "3600",
      "RateLimit-Reset": "3600",
      "X-Request-Id": "request_1",
    });
    const response = errorFromUnknown(new DeploymentAdmissionExhaustedError(), inherited, url);

    expect(response.status).toBe(402);
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(response.headers.get("RateLimit-Reset")).toBeNull();
    expect(response.headers.get("RateLimit-Remaining")).toBe("7");
    expect(response.headers.get("X-Request-Id")).toBe("request_1");
    const body = await response.json();
    expect(body).toMatchObject({
      detail: expect.stringContaining("add credits in Billing"),
      instance: `urn:bisibility:api:v1:${url.pathname}`,
      status: 402,
      type: "https://bisibility.com/problems/credits_exhausted",
    });
    expect(body.details).toEqual({ balance_cents: null });
    expect(JSON.stringify(body)).not.toMatch(/wallet[_-]|connection[_-]|project_1/);
  });

  it("keeps authorized details through nested provider-chain admission", async () => {
    const admission = new DeploymentAdmissionExhaustedError("balance", { projectId: "project_1" });
    expect(JSON.stringify(admission)).not.toContain("project_1");
    const { ProviderChainError } = await import("@/lib/rank-check/provider-chain-error");
    const chain = new ProviderChainError(
      [{ provider: "hosted", message: "Unavailable" }],
      admission,
    );
    const response = errorFromUnknown(chain, headers, url, {
      balance_cents: 7.25,
      top_up_url: "/app/prj_a00000000000000000000000/settings/billing",
    });
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      details: {
        balance_cents: 7.25,
        top_up_url: "/app/prj_a00000000000000000000000/settings/billing",
      },
    });
  });

  it("maps a deployment cap to a scoped 429 budget problem with reset timing", async () => {
    const response = errorFromUnknown(
      new DeploymentAdmissionExhaustedError("budget", {
        scope: "connection",
        surface: "programmatic",
      }),
      headers,
      url,
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      details: { scope: "connection", surface: "programmatic", resets_at: expect.any(String) },
      type: "https://bisibility.com/problems/budget_exhausted",
    });
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("leaves legacy project budget without a wallet or connection scope", async () => {
    const response = errorFromUnknown(
      new DeploymentAdmissionExhaustedError("budget", { surface: "programmatic" }),
      headers,
      url,
    );
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.details.surface).toBe("programmatic");
    expect(body.details.scope).toBeUndefined();
  });

  it("does not map arbitrary names or provider billing messages as deployment credits", async () => {
    const named = new Error("Provider account has insufficient credit.");
    named.name = "DeploymentAdmissionExhaustedError";
    const response = errorFromUnknown(named, headers, url);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      type: "https://bisibility.com/problems/internal_server_error",
    });
  });
  it("maps a budget-exhausted rank-check launch to the budget problem with surface", async () => {
    const response = errorFromUnknown(
      new LaunchRankCheckRunError("budget_exhausted"),
      headers,
      url,
    );

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.details.surface).toBe("programmatic");
    expect(typeof body.details.resets_at).toBe("string");
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(response.headers.get("RateLimit-Reset")).toBeTruthy();
  });

  it("maps a provider-less rank-check launch to a provider conflict", async () => {
    const response = errorFromUnknown(new LaunchRankCheckRunError("no_provider"), headers, url);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "No connected rank data provider is available.",
      status: 409,
      type: "https://bisibility.com/problems/provider_unavailable",
    });
  });

  it("maps a cost-limited rank-check launch to a 422 with the estimate", async () => {
    const response = errorFromUnknown(
      new LaunchRankCheckRunError("cost_limit_exceeded", 12),
      headers,
      url,
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.detail).toBe("The estimated rank check cost exceeds max_cost_cents.");
    expect(body.details.estimated_cost_cents).toBe(12);
  });

  it("keeps the legacy rank-check budget error on 429", async () => {
    const response = errorFromUnknown(
      new BudgetExhaustedError({ capCents: 500, projectId: "project_1", spentCents: 500 }),
      headers,
      url,
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      type: "https://bisibility.com/problems/budget_exhausted",
    });
  });

  it("maps an operation access denial to the existing 403 forbidden problem", async () => {
    const response = errorFromUnknown(new OperationAccessDeniedError(), headers, url);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.title).toBe("Forbidden");
    expect(body.detail).toBe("This operation is unavailable for this project.");
  });
});
