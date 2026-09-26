import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  getSession: vi.fn(),
  admissionDetails: vi.fn(),
  quoteReservations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions/_shared")>();
  return { ...actual, getActionActor: mocks.getActionActor };
});
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/providers/execution-extension", () => ({
  quoteDeploymentRankReservations: mocks.quoteReservations,
}));
vi.mock("@/lib/providers/admission-error-details", () => ({
  loadAdmissionErrorDetails: mocks.admissionDetails,
}));
vi.mock("@/lib/rank-check/schedules/service", () => ({
  DefaultCheckScheduleDeletionError: class DefaultCheckScheduleDeletionError extends Error {
    readonly code = "default_check_schedule";

    constructor() {
      super("The default check schedule cannot be deleted.");
      this.name = "DefaultCheckScheduleDeletionError";
    }
  },
}));

import { ProjectNotFoundError } from "@/lib/actions/_shared";
import { ApiConflictError, ApiInputError, ApiNotFoundError } from "@/lib/api/errors";
import { AuthorizationError } from "@/lib/auth/authorize";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { quoteRankRunReservationForLaunch } from "@/lib/rank-check/runs/launch-preflight";
import { LaunchRankCheckRunError } from "@/lib/rank-check/runs/launch-types";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { DefaultCheckScheduleDeletionError } from "@/lib/rank-check/schedules/service";
import { z } from "zod";
import { withAppRoute } from "./app-route";

const request = new Request("https://example.com/api/rank-check-runs");

describe("withAppRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.admissionDetails.mockResolvedValue(null);
  });

  it("rejects a missing session before resolving the actor", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await withAppRoute(async () => new Response())(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getActionActor).not.toHaveBeenCalled();
  });

  it("passes the actor and applies private no-store to successful responses", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const response = await withAppRoute(handler)(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).toHaveBeenCalledWith(request, { id: "user_1" }, undefined);
  });

  it.each([
    [new AuthorizationError("forbidden"), 403],
    [new ProjectNotFoundError(), 404],
    [new ApiNotFoundError("Run not found."), 404],
    [new ApiInputError("Bad input."), 400],
    [new ApiConflictError("Conflict."), 409],
    [new PreviewTokenError("expired"), 409],
    [new LaunchRankCheckRunError("budget_exhausted"), 429],
    [z.string().safeParse(1).error, 400],
  ])("maps an expected failure to %s", async (failure, status) => {
    const response = await withAppRoute(async () => {
      throw await failure;
    })(request);

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).instance).toBe("urn:bisibility:app:rank-check-runs:error");
  });

  it("returns the reset time and retry header for an app launch budget refusal", async () => {
    const response = await withAppRoute(async () => {
      throw new LaunchRankCheckRunError("budget_exhausted");
    })(request);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toMatchObject({
      type: "https://bisibility.com/problems/budget_exhausted",
      details: { surface: "app", resets_at: expect.any(String) },
    });
    const reset = new Date(body.details.resets_at);
    expect(reset.getUTCDate()).toBe(1);
    expect(reset.getUTCHours()).toBe(0);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("RateLimit-Reset")).toBe(response.headers.get("Retry-After"));
  });

  it.each([
    new ProviderAllocationExhaustedError("connection_1", "app"),
    new BudgetExhaustedError({ projectId: "project_1", capCents: 1, spentCents: 1 }),
  ])("keeps a real launch reservation refusal at 429", async (failure) => {
    mocks.quoteReservations.mockRejectedValueOnce(failure);
    const response = await withAppRoute(async () => {
      await quoteRankRunReservationForLaunch({} as Prisma.TransactionClient, {
        connection: {
          id: "connection_1",
          provider: "dataforseo",
          credentialSource: "hosted",
          credentialsEncrypted: null,
          costPerCheckCents: null,
          rateContext: undefined,
        },
        projectId: "project_1",
        source: "app",
        targets: [{ keywordId: "keyword_1", cost: 1, depth: 10 }],
      });
      return new Response();
    })(request);
    expect(mocks.quoteReservations).toHaveBeenCalled();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      details: { surface: "app", resets_at: expect.any(String) },
      type: "https://bisibility.com/problems/budget_exhausted",
    });
  });

  it("maps deployment admission in session app routes", async () => {
    const balance = await withAppRoute(async () => {
      throw new DeploymentAdmissionExhaustedError();
    })(request);
    expect(balance.status).toBe(402);
    expect(balance.headers.get("cache-control")).toBe("private, no-store");
    await expect(balance.json()).resolves.toMatchObject({
      type: "https://bisibility.com/problems/credits_exhausted",
    });

    const cap = await withAppRoute(async () => {
      throw new DeploymentAdmissionExhaustedError("budget", { scope: "wallet" });
    })(request);
    expect(cap.status).toBe(429);
    await expect(cap.json()).resolves.toMatchObject({
      details: { scope: "wallet", surface: "app", resets_at: expect.any(String) },
    });
    expect(cap.headers.get("Retry-After")).toBeTruthy();

    const legacy = await withAppRoute(async () => {
      throw new DeploymentAdmissionExhaustedError("budget", { surface: "app" });
    })(request);
    expect(legacy.status).toBe(429);
    expect((await legacy.json()).details.scope).toBeUndefined();
  });

  it("adds owner details for a trusted admission in a session app route", async () => {
    mocks.admissionDetails.mockResolvedValue({
      balance_cents: 4,
      top_up_url: "/app/prj_a00000000000000000000000/settings/billing",
    });
    const response = await withAppRoute(async () => {
      throw new DeploymentAdmissionExhaustedError("balance", { projectId: "project_1" });
    })(request);
    expect(response.status).toBe(402);
    expect(mocks.admissionDetails).toHaveBeenCalledWith("project_1", null, "user_1");
    await expect(response.json()).resolves.toMatchObject({
      details: { balance_cents: 4 },
    });
  });

  it("logs and contains an unexpected failure", async () => {
    const error = new Error("unexpected");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await withAppRoute(async () => {
      throw error;
    })(request);

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith("[rank-check-runs] App route failed.", error);
    log.mockRestore();
  });

  it("maps default schedule deletion to a safe conflict response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await withAppRoute(async () => {
      throw new DefaultCheckScheduleDeletionError();
    })(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        detail: "The default check schedule cannot be deleted.",
        status: 409,
        title: "Conflict",
      }),
    );
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
