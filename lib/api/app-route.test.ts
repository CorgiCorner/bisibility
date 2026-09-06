import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions/_shared")>();
  return { ...actual, getActionActor: mocks.getActionActor };
});
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
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
    [new LaunchRankCheckRunError("budget_exhausted"), 409],
    [z.string().safeParse(1).error, 400],
  ])("maps an expected failure to %s", async (failure, status) => {
    const response = await withAppRoute(async () => {
      throw await failure;
    })(request);

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).instance).toBe("urn:bisibility:app:rank-check-runs:error");
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
