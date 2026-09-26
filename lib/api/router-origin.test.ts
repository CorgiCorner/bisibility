import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => {
  const captured: ApiContext[] = [];
  return {
    authenticateBearer: vi.fn(),
    captured,
    getProjectOverview: vi.fn((ctx: ApiContext) => {
      captured.push(ctx);
      return Response.json({ overview: true });
    }),
  };
});

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./project-overview", () => ({ getProjectOverview: mocks.getProjectOverview }));

function projectKeyAuth() {
  return {
    apiKey: {
      id: "api_key_1",
      name: "Production",
      prefix: "bsb_key_live_",
      projectId: "project_1",
      scopes: ["read", "write", "admin"],
    },
    kind: "project_key" as const,
    project: {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      domain: "example.com",
      id: "project_1",
      name: "Example",
      publicId: "prj_a00000000000000000000000",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  };
}

function overviewRequest(source: string) {
  return new Request("https://example.test/api/v1/projects/prj_a00000000000000000000000/overview", {
    headers: {
      authorization: "Bearer bsb_key_test_1234567890abcdef",
      "x-bisibility-source": source,
    },
    method: "GET",
  });
}

async function call(source: string) {
  return handleApiRequest(overviewRequest(source), [
    "projects",
    "prj_a00000000000000000000000",
    "overview",
  ]);
}

describe("API request origin on the router context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captured.length = 0;
    mocks.authenticateBearer.mockResolvedValue(projectKeyAuth());
  });

  it("derives the origin from the credential and source header", async () => {
    const response = await call("sdk");

    expect(response.status).toBe(200);
    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0]?.origin).toEqual({
      credentialId: "api_key_1",
      credentialKind: "project_key",
      source: "sdk",
      surface: "programmatic",
    });
  });

  it("falls back to the api source for unknown header values without failing", async () => {
    const response = await call("bogus");

    expect(response.status).toBe(200);
    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0]?.origin).toEqual({
      credentialId: "api_key_1",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    });
  });
});
